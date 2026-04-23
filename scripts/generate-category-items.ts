import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const LOCALES = ["en", "pt", "es"] as const;
const MAX_NAME_LENGTH = 36;
const MAX_DESCRIPTION_LENGTH = 120;
const MIN_GLOBAL_RECOGNITION_SCORE = 8;
const MAX_LOCALISM_RISK = 3;
const MIN_PLAYABILITY_SCORE = 8;
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const PARTY_MODE_CATEGORY_ID = "party_mode";
const PARTY_MODE_FORBIDDEN_TERMS = [
  "20 questions",
  "charades",
  "challenge",
  "game prompt",
  "group challenge",
  "hot seat",
  "never have i ever",
  "party game",
  "rapid fire",
  "speed round",
  "truth or dare",
  "two truths",
  "would you rather",
  "desafio",
  "duas verdades",
  "eu nunca",
  "jogo de festa",
  "mimica",
  "rodada relampago",
  "tiro rapido",
  "verdade ou desafio",
  "voce prefere",
  "actividad",
  "desafio grupal",
  "dos verdades",
  "juego de fiesta",
  "rafaga",
  "ronda relampago",
  "verdad o reto",
  "yo nunca",
];
const PARTY_MODE_NAME_ONLY_FORBIDDEN_TERMS = new Set(["challenge", "desafio"]);

type Locale = (typeof LOCALES)[number];

type Category = {
  id: string;
  nameKey: string;
  descriptionKey: string;
  itemsFile: string;
  icon: string;
  isPremium: boolean;
  order: number;
};

type CategoryItem = {
  id: string;
  categoryId: string;
  nameKey: string;
  descriptionKey: string;
  order: number;
};

type LocaleItem = {
  name: string;
  description: string;
};

type LocaleFile = {
  categoryItems: Record<string, Record<string, LocaleItem>>;
};

type Candidate = {
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  globalRecognitionScore: number;
  localismRisk: number;
  playabilityScore: number;
  shortReason: string;
};

type GeneratedPayload = {
  categoryId: string;
  items: Candidate[];
};

type CliOptions =
  | {
      mode: "single";
      categoryId: string;
      count: number;
      dryRun: boolean;
      batchSize: number;
      target: number;
      maxAttempts: number;
    }
  | {
      mode: "all";
      dryRun: boolean;
      batchSize: number;
      target: number;
      maxAttempts: number;
    };

type RejectedCandidate = {
  label: string;
  reasons: string[];
};

type ApprovedCandidate = {
  id: string;
  order: number;
  candidate: Candidate;
};

type ProjectData = {
  repoRoot: string;
  categories: Category[];
  localePaths: Record<Locale, string>;
  localeFiles: Record<Locale, LocaleFile>;
};

type DuplicateIndex = {
  exact: Set<string>;
  compact: Set<string>;
};

type CategoryBatchResult = {
  approved: ApprovedCandidate[];
  rejected: RejectedCandidate[];
  nextItems: CategoryItem[];
};

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  await loadDotEnv();

  const repoRoot = process.cwd();
  const categoriesPath = path.join(repoRoot, "assets/categories/categories.json");
  const categories = await readJson<Category[]>(categoriesPath);
  const localePaths = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      path.join(repoRoot, `locales/category-items/${locale}.json`),
    ]),
  ) as Record<Locale, string>;

  const localeFiles = Object.fromEntries(
    await Promise.all(
      LOCALES.map(async (locale) => [locale, await readJson<LocaleFile>(localePaths[locale])]),
    ),
  ) as Record<Locale, LocaleFile>;

  const project: ProjectData = {
    repoRoot,
    categories,
    localePaths,
    localeFiles,
  };

  if (options.mode === "all") {
    await fillAllCategoriesToTarget(project, options);
    return;
  }

  const category = categories.find((item) => item.id === options.categoryId);

  if (!category) {
    const knownCategories = categories.map((item) => item.id).join(", ");
    throw new Error(
      `Categoria "${options.categoryId}" não encontrada em assets/categories/categories.json. Categorias disponíveis: ${knownCategories}`,
    );
  }

  const existingItems = await readCategoryItems(project, category);
  const result = await runCategoryBatch({
    project,
    category,
    existingItems,
    count: options.count,
    dryRun: options.dryRun,
    allowPartial: false,
  });

  if (!options.dryRun && result.approved.length < options.count) {
    throw new Error(
      `Foram aprovados apenas ${result.approved.length}/${options.count} itens. Rode com --dry-run para ver os descartes ou tente novamente.`,
    );
  }
}

function parseCliArgs(args: string[]): CliOptions {
  const dryRun = hasFlag(args, "--dry-run");
  const batchSize = readPositiveIntegerFlag(args, "--batch-size", 25);
  const target = readPositiveIntegerFlag(args, "--target", 100);
  const maxAttempts = readPositiveIntegerFlag(args, "--max-attempts", 4);

  if (batchSize > 80) {
    throw new Error("batch-size máximo é 80 para manter revisão, custo e qualidade sob controle.");
  }

  if (hasFlag(args, "--all")) {
    return {
      mode: "all",
      dryRun,
      batchSize,
      target,
      maxAttempts,
    };
  }

  const positional = getPositionalArgs(args);
  const [categoryId, countValue] = positional;

  if (!categoryId || !countValue) {
    throw new Error(
      [
        "Uso single: pnpm tsx scripts/generate-category-items.ts <categoryId> <count> [--dry-run]",
        "Exemplo: pnpm tsx scripts/generate-category-items.ts movies_tv 20 --dry-run",
        "Uso all: pnpm tsx scripts/generate-category-items.ts --all --target 100 [--batch-size 25] [--dry-run]",
      ].join("\n"),
    );
  }

  const count = Number(countValue);

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`count precisa ser um inteiro positivo. Valor recebido: "${countValue}".`);
  }

  if (count > 80) {
    throw new Error("count máximo é 80 no modo single. Use --all --target 100 --batch-size 25 para preencher em lotes.");
  }

  return {
    mode: "single",
    categoryId,
    count,
    dryRun,
    batchSize,
    target,
    maxAttempts,
  };
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

function readPositiveIntegerFlag(args: string[], flag: string, fallback: number) {
  const equalsPrefix = `${flag}=`;
  const equalsValue = args.find((arg) => arg.startsWith(equalsPrefix))?.slice(equalsPrefix.length);
  const flagIndex = args.indexOf(flag);
  const rawValue = equalsValue ?? (flagIndex >= 0 ? args[flagIndex + 1] : undefined);

  if (rawValue === undefined || rawValue.startsWith("--")) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} precisa ser um inteiro positivo. Valor recebido: "${rawValue}".`);
  }

  return value;
}

function getPositionalArgs(args: string[]) {
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (["--target", "--batch-size", "--max-attempts"].includes(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      continue;
    }

    positionals.push(arg);
  }

  return positionals;
}

async function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");

  try {
    const content = await readFile(envPath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional; environment variables can also be provided by the shell.
  }
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Não foi possível ler JSON em ${relativePath(filePath)}: ${errorMessage(error)}`);
  }
}

async function writeJson(filePath: string, data: unknown) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fillAllCategoriesToTarget(
  project: ProjectData,
  options: Extract<CliOptions, { mode: "all" }>,
) {
  console.log(
    `\nModo all: preenchendo categorias até ${options.target} item(ns), em lotes de até ${options.batchSize}.`,
  );

  for (const category of project.categories.sort((a, b) => a.order - b.order)) {
    let existingItems = await readCategoryItems(project, category);

    if (existingItems.length >= options.target) {
      console.log(`\n${category.id}: já tem ${existingItems.length}/${options.target}; pulando.`);
      continue;
    }

    console.log(`\n${category.id}: ${existingItems.length}/${options.target}; faltam ${options.target - existingItems.length}.`);
    let attemptsWithoutProgress = 0;

    while (existingItems.length < options.target) {
      const remaining = options.target - existingItems.length;
      const count = Math.min(remaining, options.batchSize);
      const result = await runCategoryBatch({
        project,
        category,
        existingItems,
        count,
        dryRun: options.dryRun,
        allowPartial: true,
      });

      if (result.approved.length === 0) {
        attemptsWithoutProgress += 1;

        if (attemptsWithoutProgress >= options.maxAttempts) {
          throw new Error(
            `${category.id}: sem progresso após ${options.maxAttempts} tentativa(s). Revise descartes com --dry-run ou reduza o target.`,
          );
        }

        console.log(
          `${category.id}: nenhum item aprovado nesta tentativa; tentando novamente (${attemptsWithoutProgress}/${options.maxAttempts}).`,
        );
        continue;
      }

      attemptsWithoutProgress = 0;
      existingItems = result.nextItems;
      console.log(`${category.id}: agora ${existingItems.length}/${options.target}.`);
    }
  }

  console.log(options.dryRun ? "\nDry-run concluído; nenhum arquivo foi gravado." : "\nTodas as categorias foram processadas.");
}

async function readCategoryItems(project: ProjectData, category: Category) {
  const itemsPath = getItemsPath(project, category);
  const existingItems = await readJson<CategoryItem[]>(itemsPath);
  validateExistingData(category.id, existingItems, project.localeFiles);

  return existingItems;
}

async function runCategoryBatch(params: {
  project: ProjectData;
  category: Category;
  existingItems: CategoryItem[];
  count: number;
  dryRun: boolean;
  allowPartial: boolean;
}): Promise<CategoryBatchResult> {
  const itemsPath = getItemsPath(params.project, params.category);

  const generatedPayload = await generateCandidatesWithAi({
    category: params.category,
    count: params.count,
    existingNames: getExistingNames(params.project.localeFiles),
  });

  if (generatedPayload.categoryId !== params.category.id) {
    throw new Error(
      `A IA retornou categoryId "${generatedPayload.categoryId}", mas o esperado era "${params.category.id}".`,
    );
  }

  const { approved, rejected } = approveCandidates({
    payload: generatedPayload,
    categoryId: params.category.id,
    count: params.count,
    existingItems: params.existingItems,
    localeFiles: params.project.localeFiles,
  });

  if (!params.dryRun && !params.allowPartial && approved.length < params.count) {
    throw new Error(
      `Foram aprovados apenas ${approved.length}/${params.count} itens. Rode com --dry-run para ver os descartes ou tente novamente.`,
    );
  }

  if (params.dryRun) {
    const { nextItems, nextLocaleFiles } = mergeApprovedItems({
      categoryId: params.category.id,
      existingItems: params.existingItems,
      localeFiles: params.project.localeFiles,
      approved,
    });

    validateMergedData(params.category.id, nextItems, nextLocaleFiles, approved);
    params.project.localeFiles = nextLocaleFiles;
    logDryRun({
      category: params.category,
      approved,
      rejected,
      itemsPath,
      localePaths: params.project.localePaths,
      requestedCount: params.count,
    });

    return { approved, rejected, nextItems };
  }

  const { nextItems, nextLocaleFiles } = mergeApprovedItems({
    categoryId: params.category.id,
    existingItems: params.existingItems,
    localeFiles: params.project.localeFiles,
    approved,
  });

  validateMergedData(params.category.id, nextItems, nextLocaleFiles, approved);

  await writeJson(itemsPath, nextItems);
  await Promise.all(
    LOCALES.map((locale) => writeJson(params.project.localePaths[locale], nextLocaleFiles[locale])),
  );

  params.project.localeFiles = nextLocaleFiles;

  console.log(`OK: ${approved.length}/${params.count} item(ns) adicionados em "${params.category.id}".`);
  console.log(`Itens: ${approved.map((item) => item.id).join(", ") || "(nenhum)"}`);

  return { approved, rejected, nextItems };
}

function getItemsPath(project: ProjectData, category: Category) {
  return path.join(project.repoRoot, "assets/categories", category.itemsFile);
}

function validateExistingData(
  categoryId: string,
  existingItems: CategoryItem[],
  localeFiles: Record<Locale, LocaleFile>,
) {
  const ids = new Set<string>();
  const orders = new Set<number>();

  for (const item of existingItems) {
    if (item.categoryId !== categoryId) {
      throw new Error(`Item "${item.id}" aponta para categoryId "${item.categoryId}", esperado "${categoryId}".`);
    }

    if (ids.has(item.id)) {
      throw new Error(`Item duplicado no arquivo de itens: "${item.id}".`);
    }

    if (orders.has(item.order)) {
      throw new Error(`Order duplicado no arquivo de itens: "${item.order}".`);
    }

    ids.add(item.id);
    orders.add(item.order);

    const expectedNameKey = `categoryItems.${categoryId}.${item.id}.name`;
    const expectedDescriptionKey = `categoryItems.${categoryId}.${item.id}.description`;

    if (item.nameKey !== expectedNameKey || item.descriptionKey !== expectedDescriptionKey) {
      throw new Error(`Keys inconsistentes no item "${item.id}".`);
    }

    for (const locale of LOCALES) {
      const localeItem = localeFiles[locale].categoryItems?.[categoryId]?.[item.id];

      if (!localeItem?.name || !localeItem?.description) {
        throw new Error(`Locale ${locale} sem name/description para "${item.id}".`);
      }
    }
  }
}

function getExistingNames(localeFiles: Record<Locale, LocaleFile>, categoryId?: string) {
  const names = new Set<string>();

  for (const locale of LOCALES) {
    const categories = localeFiles[locale].categoryItems ?? {};
    const categoryIds = categoryId ? [categoryId] : Object.keys(categories);

    for (const currentCategoryId of categoryIds) {
      const categoryItems = categories[currentCategoryId] ?? {};

      for (const item of Object.values(categoryItems)) {
        names.add(item.name);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function generateCandidatesWithAi(params: {
  category: Category;
  count: number;
  existingNames: string[];
}): Promise<GeneratedPayload> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não encontrado. Defina no .env ou no ambiente antes de rodar o script.",
    );
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const reasoningEffort = process.env.OPENAI_REASONING_EFFORT?.trim();
  const candidateCount = Math.max(params.count * 3, params.count + 12);
  const requestBody: Record<string, unknown> = {
    model,
    input: [
      {
        role: "system",
        content: [
          "Você é editor de conteúdo para um party game global de adivinhação em grupo.",
          "Gere apenas itens com reconhecimento internacional, fáceis de ler à distância e bons para perguntas de sim/não.",
          "Evite localismo, memes passageiros, política sensível, conteúdo ofensivo, sexual explícito e referências restritas a um país.",
          "A resposta deve ser JSON e seguir exatamente o schema solicitado.",
        ].join(" "),
      },
      {
        role: "user",
        content: buildGenerationPrompt(params.category, candidateCount, params.existingNames),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "category_item_candidates",
        strict: true,
        schema: candidateSchema(),
      },
    },
  };

  if (reasoningEffort) {
    requestBody.reasoning = { effort: reasoningEffort };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new Error(
      `Erro na OpenAI API (${response.status}): ${JSON.stringify(data ?? {}, null, 2)}`,
    );
  }

  const text = extractOpenAiText(data);
  const parsed = parseJsonObject(text);

  return parsed as GeneratedPayload;
}

function buildGenerationPrompt(category: Category, candidateCount: number, existingNames: string[]) {
  const existingNamesPreview = existingNames.length > 0 ? existingNames.join(", ") : "(nenhum)";
  const categorySpecificRules = getCategorySpecificRules(category.id);

  return [
    `Categoria existente: ${category.id}`,
    `Chave de nome da categoria: ${category.nameKey}`,
    `Gere ${candidateCount} candidatos para que o script aprove os melhores.`,
    "",
    "Regras editoriais obrigatórias:",
    "- O app é global; escolha referências conhecidas em múltiplos países.",
    "- Evite localismo, regionalismos, memes passageiros, celebridades restritas a um país e marcas pouco distribuídas.",
    "- Não use conteúdo ofensivo, sexual explícito, político sensível ou excessivamente local.",
    "- Os nomes devem ser curtos, fáceis de ler à distância e bons para um jogo de adivinhação em grupo.",
    "- As descrições devem ser curtas, neutras e úteis, sem entregar contexto demais.",
    "- Os itens devem funcionar bem com perguntas de sim/não.",
    "- Não repita nenhum item existente nem repita itens dentro da geração atual.",
    ...(categorySpecificRules.length > 0 ? ["", ...categorySpecificRules] : []),
    "",
    "Scores obrigatórios:",
    `- globalRecognitionScore: 8 a 10; use 8+ somente se o item for amplamente reconhecido internacionalmente.`,
    `- localismRisk: 1 a 3; descarte mentalmente qualquer ideia acima de 3.`,
    `- playabilityScore: 8 a 10; priorize itens com pistas claras para perguntas de sim/não.`,
    "",
    `Nomes já existentes no app, em qualquer categoria ou idioma: ${existingNamesPreview}`,
    "",
    "Retorne JSON no formato intermediário esperado, com categoryId e items.",
  ].join("\n");
}

function getCategorySpecificRules(categoryId: string) {
  if (categoryId !== PARTY_MODE_CATEGORY_ID) {
    return [];
  }

  return [
    "Regras especiais para party_mode:",
    "- Esta categoria deve ser uma mistura aleatória e caótica de coisas fáceis de adivinhar.",
    "- Gere itens concretos e variados: pessoas famosas, personagens, animais, comidas, objetos, lugares, marcas, ações simples, profissões e conceitos populares.",
    "- Não gere nomes de brincadeiras, dinâmicas de grupo, regras, rodadas, desafios, prompts ou modos de jogo.",
    "- Evite itens como Charades, 20 Questions, Truth or Dare, Would You Rather, Hot Seat, Speed Round, Mimica, Eu Nunca ou equivalentes traduzidos.",
    "- Misture tipos de item no mesmo lote; não faça uma sequência inteira do mesmo tema.",
    "- Bons exemplos de estilo: Pizza, Dinosaur, Eiffel Tower, Beyoncé, Soccer Ball, Pirate, Toothbrush, Netflix, Astronaut, Lightning.",
    "- As descrições devem explicar o item, não instruir o jogador a fazer uma ação.",
  ];
}

function candidateSchema() {
  const localizedStringSchema = {
    type: "object",
    additionalProperties: false,
    required: LOCALES,
    properties: {
      en: { type: "string" },
      pt: { type: "string" },
      es: { type: "string" },
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["categoryId", "items"],
    properties: {
      categoryId: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "description",
            "globalRecognitionScore",
            "localismRisk",
            "playabilityScore",
            "shortReason",
          ],
          properties: {
            name: localizedStringSchema,
            description: localizedStringSchema,
            globalRecognitionScore: { type: "number" },
            localismRisk: { type: "number" },
            playabilityScore: { type: "number" },
            shortReason: { type: "string" },
          },
        },
      },
    },
  };
}

function extractOpenAiText(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Resposta vazia da OpenAI API.");
  }

  const outputText = (data as { output_text?: unknown }).output_text;

  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const output = (data as { output?: unknown }).output;

  if (Array.isArray(output)) {
    const chunks = output.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const content = (item as { content?: unknown }).content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((contentItem) => {
        if (!contentItem || typeof contentItem !== "object") {
          return [];
        }

        const refusal = (contentItem as { refusal?: unknown }).refusal;

        if (typeof refusal === "string" && refusal.trim()) {
          throw new Error(`A OpenAI API recusou a geração: ${refusal}`);
        }

        const text = (contentItem as { text?: unknown }).text;
        return typeof text === "string" ? [text] : [];
      });
    });

    const text = chunks.join("\n").trim();

    if (text) {
      return text;
    }
  }

  throw new Error(`Não foi possível extrair texto da resposta da OpenAI API: ${JSON.stringify(data, null, 2)}`);
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("A OpenAI API não retornou um JSON válido.");
  }
}

function approveCandidates(params: {
  payload: GeneratedPayload;
  categoryId: string;
  count: number;
  existingItems: CategoryItem[];
  localeFiles: Record<Locale, LocaleFile>;
}) {
  if (!Array.isArray(params.payload.items)) {
    throw new Error("A IA não retornou um array em items.");
  }

  const existingDuplicateIndex = buildDuplicateIndex(params.localeFiles);
  const generatedDuplicateIndex = createDuplicateIndex();
  const rejected: RejectedCandidate[] = [];
  const approvedCandidates: Candidate[] = [];

  for (const candidate of params.payload.items) {
    const label = candidate?.name?.en || candidate?.name?.pt || candidate?.name?.es || "(sem nome)";
    const reasons = validateCandidate(
      candidate,
      params.categoryId,
      existingDuplicateIndex,
      generatedDuplicateIndex,
    );

    if (reasons.length > 0) {
      rejected.push({ label, reasons });
      continue;
    }

    addCandidateToDuplicateIndex(generatedDuplicateIndex, candidate);

    if (approvedCandidates.length < params.count) {
      approvedCandidates.push(candidate);
    } else {
      rejected.push({
        label,
        reasons: ["aprovado nas validações, mas excedente ao count solicitado"],
      });
    }
  }

  const nextIds = allocateNextIds(params.categoryId, params.existingItems, approvedCandidates.length);
  const approved = approvedCandidates.map((candidate, index) => ({
    id: nextIds[index],
    order: Number(nextIds[index].replace(`${params.categoryId}_`, "")),
    candidate,
  }));

  return { approved, rejected };
}

function validateCandidate(
  candidate: Candidate,
  categoryId: string,
  existingDuplicateIndex: DuplicateIndex,
  generatedDuplicateIndex: DuplicateIndex,
) {
  const reasons: string[] = [];

  if (!candidate || typeof candidate !== "object") {
    return ["candidato inválido"];
  }

  for (const locale of LOCALES) {
    const name = candidate.name?.[locale]?.trim();
    const description = candidate.description?.[locale]?.trim();

    if (!name) {
      reasons.push(`name.${locale} ausente`);
    } else if (name.length > MAX_NAME_LENGTH) {
      reasons.push(`name.${locale} tem ${name.length} caracteres; máximo ${MAX_NAME_LENGTH}`);
    }

    if (!description) {
      reasons.push(`description.${locale} ausente`);
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      reasons.push(
        `description.${locale} tem ${description.length} caracteres; máximo ${MAX_DESCRIPTION_LENGTH}`,
      );
    }

    const signatures = name ? getDuplicateSignatures(name) : undefined;

    if (signatures && hasDuplicate(existingDuplicateIndex, signatures)) {
      reasons.push(`duplicado com item existente (${locale}: ${name})`);
    }

    if (signatures && hasDuplicate(generatedDuplicateIndex, signatures)) {
      reasons.push(`duplicado dentro da geração atual (${locale}: ${name})`);
    }
  }

  if (!isValidScore(candidate.globalRecognitionScore, MIN_GLOBAL_RECOGNITION_SCORE, 10)) {
    reasons.push(
      `globalRecognitionScore precisa ser >= ${MIN_GLOBAL_RECOGNITION_SCORE}; recebido ${candidate.globalRecognitionScore}`,
    );
  }

  if (!isValidScore(candidate.localismRisk, 1, MAX_LOCALISM_RISK)) {
    reasons.push(`localismRisk precisa ser <= ${MAX_LOCALISM_RISK}; recebido ${candidate.localismRisk}`);
  }

  if (!isValidScore(candidate.playabilityScore, MIN_PLAYABILITY_SCORE, 10)) {
    reasons.push(
      `playabilityScore precisa ser >= ${MIN_PLAYABILITY_SCORE}; recebido ${candidate.playabilityScore}`,
    );
  }

  if (!candidate.shortReason?.trim()) {
    reasons.push("shortReason ausente");
  }

  if (categoryId === PARTY_MODE_CATEGORY_ID) {
    reasons.push(...validatePartyModeCandidate(candidate));
  }

  return reasons;
}

function validatePartyModeCandidate(candidate: Candidate) {
  const reasons: string[] = [];
  const searchableNames = LOCALES.map((locale) => candidate.name?.[locale] ?? "")
    .map(normalizeForDuplicateCheck)
    .join(" ");
  const searchableFullText = [
    ...LOCALES.flatMap((locale) => [
      candidate.name?.[locale] ?? "",
      candidate.description?.[locale] ?? "",
    ]),
    candidate.shortReason ?? "",
  ]
    .map(normalizeForDuplicateCheck)
    .join(" ");

  const forbiddenTerm = PARTY_MODE_FORBIDDEN_TERMS.find((term) => {
    const normalizedTerm = normalizeForDuplicateCheck(term);
    const searchableText = PARTY_MODE_NAME_ONLY_FORBIDDEN_TERMS.has(term)
      ? searchableNames
      : searchableFullText;

    return searchableText.includes(normalizedTerm);
  });

  if (forbiddenTerm) {
    reasons.push(
      `party_mode deve conter coisas aleatórias, não dinâmicas/regras de festa (termo: ${forbiddenTerm})`,
    );
  }

  return reasons;
}

function isValidScore(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function allocateNextIds(categoryId: string, existingItems: CategoryItem[], count: number) {
  const usedIds = new Set(existingItems.map((item) => item.id));
  const idPattern = new RegExp(`^${escapeRegExp(categoryId)}_(\\d+)$`);
  let nextNumber = existingItems.reduce((max, item) => {
    const match = item.id.match(idPattern);
    const idNumber = match ? Number(match[1]) : 0;
    return Math.max(max, idNumber, item.order);
  }, 0);
  const ids: string[] = [];

  while (ids.length < count) {
    nextNumber += 1;
    const id = `${categoryId}_${nextNumber}`;

    if (!usedIds.has(id)) {
      usedIds.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function mergeApprovedItems(params: {
  categoryId: string;
  existingItems: CategoryItem[];
  localeFiles: Record<Locale, LocaleFile>;
  approved: ApprovedCandidate[];
}) {
  const nextItems = [...params.existingItems];
  const nextLocaleFiles = JSON.parse(JSON.stringify(params.localeFiles)) as Record<Locale, LocaleFile>;

  for (const approvedItem of params.approved) {
    nextItems.push({
      id: approvedItem.id,
      categoryId: params.categoryId,
      nameKey: `categoryItems.${params.categoryId}.${approvedItem.id}.name`,
      descriptionKey: `categoryItems.${params.categoryId}.${approvedItem.id}.description`,
      order: approvedItem.order,
    });

    for (const locale of LOCALES) {
      nextLocaleFiles[locale].categoryItems[params.categoryId] ??= {};
      nextLocaleFiles[locale].categoryItems[params.categoryId][approvedItem.id] = {
        name: approvedItem.candidate.name[locale].trim(),
        description: approvedItem.candidate.description[locale].trim(),
      };
    }
  }

  nextItems.sort((a, b) => a.order - b.order);

  return { nextItems, nextLocaleFiles };
}

function validateMergedData(
  categoryId: string,
  items: CategoryItem[],
  localeFiles: Record<Locale, LocaleFile>,
  approved: ApprovedCandidate[],
) {
  validateExistingData(categoryId, items, localeFiles);

  for (const approvedItem of approved) {
    const item = items.find((entry) => entry.id === approvedItem.id);

    if (!item) {
      throw new Error(`Item aprovado "${approvedItem.id}" não foi adicionado ao arquivo de itens.`);
    }

    for (const locale of LOCALES) {
      const localeItem = localeFiles[locale].categoryItems[categoryId]?.[approvedItem.id];
      const expectedName = approvedItem.candidate.name[locale].trim();
      const expectedDescription = approvedItem.candidate.description[locale].trim();

      if (localeItem?.name !== expectedName || localeItem?.description !== expectedDescription) {
        throw new Error(`Locale ${locale} inconsistente para "${approvedItem.id}".`);
      }
    }
  }
}

function logDryRun(params: {
  category: Category;
  approved: ApprovedCandidate[];
  rejected: RejectedCandidate[];
  itemsPath: string;
  localePaths: Record<Locale, string>;
  requestedCount: number;
}) {
  console.log(`\nDry-run para categoria "${params.category.id}"`);
  console.log(`Solicitados: ${params.requestedCount}`);
  console.log(`Aprovados: ${params.approved.length}`);
  console.log(`Descartados: ${params.rejected.length}`);

  if (params.approved.length < params.requestedCount) {
    console.log(
      "\nAviso: a geração aprovou menos itens que o solicitado. Nada será salvo; rode novamente ou reduza o count.",
    );
  }

  console.log("\nItens que seriam criados:");

  for (const item of params.approved) {
    console.log(`\n- ${item.id} (order ${item.order})`);
    console.log(`  en: ${item.candidate.name.en} - ${item.candidate.description.en}`);
    console.log(`  pt: ${item.candidate.name.pt} - ${item.candidate.description.pt}`);
    console.log(`  es: ${item.candidate.name.es} - ${item.candidate.description.es}`);
    console.log(
      `  scores: recognition ${item.candidate.globalRecognitionScore}, localism ${item.candidate.localismRisk}, playability ${item.candidate.playabilityScore}`,
    );
    console.log(`  motivo: ${item.candidate.shortReason}`);
  }

  if (params.rejected.length > 0) {
    console.log("\nDescartes:");

    for (const rejected of params.rejected) {
      console.log(`- ${rejected.label}: ${rejected.reasons.join("; ")}`);
    }
  }

  console.log("\nArquivos que seriam alterados:");
  console.log(`- ${relativePath(params.itemsPath)}`);

  for (const locale of LOCALES) {
    console.log(`- ${relativePath(params.localePaths[locale])}`);
  }
}

function createDuplicateIndex(): DuplicateIndex {
  return {
    exact: new Set<string>(),
    compact: new Set<string>(),
  };
}

function buildDuplicateIndex(localeFiles: Record<Locale, LocaleFile>) {
  const index = createDuplicateIndex();

  for (const locale of LOCALES) {
    const categories = localeFiles[locale].categoryItems ?? {};

    for (const categoryItems of Object.values(categories)) {
      for (const item of Object.values(categoryItems)) {
        addNameToDuplicateIndex(index, item.name);
      }
    }
  }

  return index;
}

function addCandidateToDuplicateIndex(index: DuplicateIndex, candidate: Candidate) {
  for (const locale of LOCALES) {
    addNameToDuplicateIndex(index, candidate.name[locale]);
  }
}

function addNameToDuplicateIndex(index: DuplicateIndex, name: string) {
  const signatures = getDuplicateSignatures(name);

  if (signatures.exact) {
    index.exact.add(signatures.exact);
  }

  if (signatures.compact) {
    index.compact.add(signatures.compact);
  }
}

function hasDuplicate(index: DuplicateIndex, signatures: ReturnType<typeof getDuplicateSignatures>) {
  return index.exact.has(signatures.exact) || index.compact.has(signatures.compact);
}

function getDuplicateSignatures(value: string) {
  const exact = normalizeForDuplicateCheck(value);
  const compact = exact
    .replace(/\b(the|a|an|o|a|os|as|um|uma|uns|umas|el|la|los|las|un|una|unos|unas|le|la|les|des|der|die|das|ein|eine)\b/g, " ")
    .replace(/\s+/g, "");

  return { exact, compact };
}

function normalizeForDuplicateCheck(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function relativePath(filePath: string) {
  return path.relative(process.cwd(), filePath) || ".";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(`\nErro: ${errorMessage(error)}`);
  process.exit(1);
});
