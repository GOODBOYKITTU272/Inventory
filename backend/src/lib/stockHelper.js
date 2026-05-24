/**
 * Maps a raw product item from a vendor invoice to a unified cafeteria item
 * and converts physical packages/weights into discrete servings.
 *
 * @param {string} itemName Raw name of the item on the bill
 * @param {number} quantity Raw quantity purchased
 * @param {string} unit Unit of measurement (e.g. "box", "kg", "pcs")
 * @returns {{ cafeteriaItemName: string, servings: number|null, isOrderable: boolean, category: string }}
 */
export function mapProductToCafeteria(itemName, quantity, unit = '') {
  const nameLower = itemName.toLowerCase().trim();
  const unitLower = (unit || '').toLowerCase().trim();
  
  let targetItemName = itemName;
  let servings = quantity;
  let isOrderable = true;
  let category = 'other';
  
  // 1. Bread
  if (nameLower.includes('bread') || nameLower.includes('brd')) {
    category = 'food';
    isOrderable = false; // Breads are not ordered directly
    if (nameLower.includes('atta') || nameLower.includes('wheat')) {
      targetItemName = 'MDRN AT SHK BRD400G';
      let slicesPerPack = 16; // default for 400g
      if (nameLower.includes('350g') || nameLower.includes('350 g')) {
        slicesPerPack = 14;
      } else {
        const weightMatch = nameLower.match(/(\d+)\s*(g|gm)/);
        if (weightMatch) {
          const weight = parseInt(weightMatch[1], 10);
          slicesPerPack = Math.round(weight / 25);
        }
      }
      servings = quantity * slicesPerPack;
    } else {
      // Milk / White / Brown Bread map to 'Bread'
      targetItemName = 'Bread';
      let slicesPerPack = 16; // default for 400g
      if (nameLower.includes('350g') || nameLower.includes('350 g')) {
        slicesPerPack = 14;
      } else {
        const weightMatch = nameLower.match(/(\d+)\s*(g|gm)/);
        if (weightMatch) {
          const weight = parseInt(weightMatch[1], 10);
          slicesPerPack = Math.round(weight / 25);
        }
      }
      servings = quantity * slicesPerPack;
    }
  }
  // 2. Jam / Spreads
  else if (nameLower.includes('jam')) {
    category = 'food';
    isOrderable = true;
    if (nameLower.includes('fruit')) {
      targetItemName = 'Mix Fruit Jam';
    } else if (nameLower.includes('pineapple')) {
      targetItemName = 'Pineapple Jam';
    }
    
    // serving size = 15g
    let gramsPerPack = 4000; // default to 4kg
    if (nameLower.includes('4 kg') || nameLower.includes('4kg') || nameLower.includes('4000g')) {
      gramsPerPack = 4000;
    } else if (nameLower.includes('1 kg') || nameLower.includes('1kg') || nameLower.includes('1000g')) {
      gramsPerPack = 1000;
    } else {
      const weightMatch = nameLower.match(/(\d+)\s*(g|gm)/);
      if (weightMatch) {
        gramsPerPack = parseInt(weightMatch[1], 10);
      } else if (unitLower.includes('kg')) {
        gramsPerPack = 1000;
      } else {
        gramsPerPack = 500;
      }
    }
    servings = quantity * Math.round(gramsPerPack / 15);
  }
  else if (nameLower.includes('peanut butter')) {
    category = 'food';
    isOrderable = true;
    
    // Funfoods Creamy 750g, Funfoods Crunchy 750g, Veeba Creamy 900g
    if (nameLower.includes('creamy') && nameLower.includes('funfoods')) {
      targetItemName = 'Funfoods - Peanut Butter (Creamy), 750 gm';
    } else if (nameLower.includes('crunchy') && nameLower.includes('funfoods')) {
      targetItemName = 'Funfoods - Peanut Butter (Crunchy), 750 gm';
    } else if (nameLower.includes('creamy') && nameLower.includes('veeba')) {
      targetItemName = 'Veeba - Peanut Butter (Creamy), 900 gm';
    }
    
    // serving size = 20g
    let gramsPerPack = 750;
    const weightMatch = nameLower.match(/(\d+)\s*(g|gm)/);
    if (weightMatch) {
      gramsPerPack = parseInt(weightMatch[1], 10);
    }
    servings = quantity * Math.round(gramsPerPack / 20);
  }
  // 3. Stirrers
  else if (nameLower.includes('stirrer')) {
    category = 'other';
    isOrderable = false;
    targetItemName = 'Stirrers';
    
    let packSize = 500;
    const packMatch = nameLower.match(/(\d+)\s*(pcs|count|pack|stirrers)/);
    if (packMatch) {
      packSize = parseInt(packMatch[1], 10);
    }
    servings = quantity * packSize;
  }
  // 4. Tea / Coffee / Beverage Sachets
  else if (
    nameLower.includes('tea') || 
    nameLower.includes('coffee') || 
    nameLower.includes('sachet') || 
    nameLower.includes('hot chocolate') || 
    nameLower.includes('badam')
  ) {
    category = 'beverage';
    isOrderable = true;
    
    if (nameLower.includes('assam')) {
      targetItemName = 'Assam tea';
    } else if (nameLower.includes('elaichi')) {
      targetItemName = 'Elaichi tea';
    } else if (nameLower.includes('ginger')) {
      targetItemName = 'Ginger tea';
    } else if (nameLower.includes('hot chocolate')) {
      targetItemName = 'Hot chocolate';
    } else if (nameLower.includes('lemon')) {
      targetItemName = 'Lemon sachets';
    } else if (nameLower.includes('beans')) {
      targetItemName = 'Coffee Beans';
    } else if (nameLower.includes('badam')) {
      targetItemName = 'Badam Sachets';
    } else if (nameLower.includes('dhampure') && nameLower.includes('sugar')) {
      targetItemName = 'Dhampure - Refined (White) Sugar Sachet, 5 gm (Pack of 200)';
      category = 'other';
      isOrderable = false;
    } else if (nameLower.includes('trust') && nameLower.includes('sugar')) {
      targetItemName = 'Trust - White Sugar Sachet, 5 gm (Pack of 200)';
      category = 'other';
      isOrderable = false;
    }
    
    // Default box/pack sizes
    let packSize = 100;
    if (nameLower.includes('pack of 200') || nameLower.includes('200 sachet') || nameLower.includes('200 pcs') || nameLower.includes('200g')) {
      packSize = 200;
    } else {
      const packMatch = nameLower.match(/pack of\s*(\d+)/i) || nameLower.match(/(\d+)\s*(pcs|sachet|count|pack)/i);
      if (packMatch) {
        packSize = parseInt(packMatch[1], 10);
      }
    }
    
    if (nameLower.includes('coffee beans') && (unitLower.includes('kg') || nameLower.includes('kg'))) {
      // 1kg beans = approx 140 servings
      let kg = quantity;
      const weightMatch = nameLower.match(/(\d+)\s*kg/i);
      if (weightMatch) kg = parseInt(weightMatch[1], 10) * quantity;
      servings = Math.round(kg * 140);
    } else {
      servings = quantity * packSize;
    }
  }
  // 5. Milk
  else if (nameLower.includes('milk') && !nameLower.includes('bread') && !nameLower.includes('container') && !nameLower.includes('sachet')) {
    targetItemName = 'Milk';
    category = 'beverage';
    isOrderable = false;
    let liters = quantity;
    if (nameLower.includes('500ml') || nameLower.includes('500 ml')) {
      liters = quantity * 0.5;
    }
    servings = Math.round(liters * 5);
  }
  // 6. Water Bottle
  else if (nameLower.includes('water bottle') || nameLower.includes('water')) {
    targetItemName = 'Water Bottle';
    category = 'beverage';
    isOrderable = true;
    servings = null;
  }
  
  return {
    cafeteriaItemName: targetItemName,
    servings: servings,
    isOrderable: isOrderable,
    category: category
  };
}
