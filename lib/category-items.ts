import animals from '@/assets/categories/items/animals.json';
import athletes from '@/assets/categories/items/athletes.json';
import brazilianPersonalities from '@/assets/categories/items/brazilian_personalities.json';
import cartoonsAnimation from '@/assets/categories/items/cartoons_animation.json';
import celebrities from '@/assets/categories/items/celebrities.json';
import countries from '@/assets/categories/items/countries.json';
import everydayObjects from '@/assets/categories/items/everyday_objects.json';
import famousBrands from '@/assets/categories/items/famous_brands.json';
import fantasyCreatures from '@/assets/categories/items/fantasy_creatures.json';
import food from '@/assets/categories/items/food.json';
import moviesTv from '@/assets/categories/items/movies_tv.json';
import musicians from '@/assets/categories/items/musicians.json';
import partyMode from '@/assets/categories/items/party_mode.json';
import professions from '@/assets/categories/items/professions.json';
import superheroesVillains from '@/assets/categories/items/superheroes_villains.json';
import videoGameCharacters from '@/assets/categories/items/video_game_characters.json';

export type CategoryItem = {
  id: string;
  categoryId: string;
  nameKey: string;
  descriptionKey: string;
  order: number;
};

const itemsByCategory: Record<string, CategoryItem[]> = {
  animals,
  athletes,
  brazilian_personalities: brazilianPersonalities,
  cartoons_animation: cartoonsAnimation,
  celebrities,
  countries,
  everyday_objects: everydayObjects,
  famous_brands: famousBrands,
  fantasy_creatures: fantasyCreatures,
  food,
  movies_tv: moviesTv,
  musicians,
  party_mode: partyMode,
  professions,
  superheroes_villains: superheroesVillains,
  video_game_characters: videoGameCharacters,
};

export function getCategoryItems(categoryIds: string[]) {
  return categoryIds.flatMap((categoryId) => itemsByCategory[categoryId] ?? []);
}
