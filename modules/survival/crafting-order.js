// Keep crafting choices in registration order when their priority is the same.
export function canCraft(recipe, inventory) {
  return Object.entries(recipe.inputs || {}).every(([item, count]) => (inventory[item] || 0) >= count);
}

export function orderRecipes(recipes, inventory, items) {
  return [...recipes].map((recipe, index) => {
    const outputs = Object.keys(recipe.output || {});
    if (recipe.places) outputs.push(recipe.places);
    const definitions = outputs.map(name => items.get(name)).filter(Boolean);
    const max = key => Math.max(0, ...definitions.map(def => typeof def[key] === 'number' ? def[key] : 0));
    return { recipe, index, ready: canCraft(recipe, inventory), gear: max('gear'), damage: max('damage'), power: max('power') };
  }).sort((a, b) => Number(b.ready) - Number(a.ready) || b.gear - a.gear ||
    b.damage - a.damage || b.power - a.power || a.index - b.index).map(entry => entry.recipe);
}
