/**
 * utils/areaUnits.js
 * ------------------
 * Centralized client-side area unit conversion, building requirement rules,
 * feasibility validation, and indicative construction cost calculation.
 * 
 * Conversion Factors:
 * - 1 sq.m  = 10.7639 sq.ft
 * - 1 cent  = 435.6 sq.ft
 * - 1 acre  = 43,560 sq.ft
 */

export const SQFT_PER_SQM = 10.7639;
export const SQFT_PER_CENT = 435.6;
export const SQFT_PER_ACRE = 43560.0;

export const INPUT_UNITS = [
  { value: 'sq.ft', label: 'Square Feet (sq.ft / ft²)' },
  { value: 'sq.m', label: 'Square Meters (sq.m / m²)' },
  { value: 'cents', label: 'Cents (cent)' },
  { value: 'acres', label: 'Acres (acre)' },
];

export const BUILDING_REQUIREMENTS = {
  'Individual House': {
    minSqFt: 400,
    rateInr: 2000,
    label: 'Individual House',
    description: 'Single-family standalone residence',
  },
  'Residential House': {
    minSqFt: 400,
    rateInr: 2000,
    label: 'Residential House',
    description: 'Single-family standalone residence',
  },
  'Apartment': {
    minSqFt: 2000,
    rateInr: 2200,
    label: 'Apartment Complex',
    description: 'Multi-family residential complex',
  },
  'Commercial Building': {
    minSqFt: 1500,
    rateInr: 2500,
    label: 'Commercial Building',
    description: 'Retail, commercial office or business hub',
  },
  'School': {
    minSqFt: 5000,
    rateInr: 2000,
    label: 'Educational Facility / School',
    description: 'Educational campus with classrooms and grounds',
  },
  'Hospital': {
    minSqFt: 10000,
    rateInr: 3000,
    label: 'Hospital / Healthcare Facility',
    description: 'Multi-tier healthcare facility with emergency bays',
  },
  'Hospital/Clinic': {
    minSqFt: 10000,
    rateInr: 3000,
    label: 'Hospital / Healthcare Facility',
    description: 'Multi-tier healthcare facility with emergency bays',
  },
};

/**
 * Normalizes input unit strings to a standard unit key.
 */
export function normalizeUnit(unit) {
  if (!unit) return 'sq.ft';
  const u = String(unit).trim().toLowerCase();
  if (['sq.ft', 'sqft', 'sq_ft', 'square feet', 'square_feet', 'ft2', 'ft²'].includes(u)) return 'sq.ft';
  if (['sq.m', 'sqm', 'sq_m', 'square meters', 'square_meters', 'm2', 'm²'].includes(u)) return 'sq.m';
  if (['cents', 'cent', 'ct'].includes(u)) return 'cents';
  if (['acres', 'acre', 'ac'].includes(u)) return 'acres';
  return 'sq.ft';
}

/**
 * Converts any supported unit area to square feet (sq.ft).
 */
export function convertAreaToSqFt(value, unit = 'sq.ft') {
  const val = parseFloat(value);
  if (isNaN(val) || val <= 0) return 0;

  const normalized = normalizeUnit(unit);
  switch (normalized) {
    case 'sq.m':
      return parseFloat((val * SQFT_PER_SQM).toFixed(2));
    case 'cents':
      return parseFloat((val * SQFT_PER_CENT).toFixed(2));
    case 'acres':
      return parseFloat((val * SQFT_PER_ACRE).toFixed(2));
    case 'sq.ft':
    default:
      return parseFloat(val.toFixed(2));
  }
}

/**
 * Returns an object with conversions to all 4 supported units.
 */
export function getAllAreaConversions(areaSqFt) {
  const sqft = parseFloat(areaSqFt);
  if (isNaN(sqft) || sqft <= 0) {
    return {
      sqft: 0,
      sqm: 0,
      cents: 0,
      acres: 0,
      formattedDisplay: '0.00 m² | 0.00 sq.ft | 0.0000 cents | 0.0000 acres',
    };
  }

  const sqm = parseFloat((sqft / SQFT_PER_SQM).toFixed(2));
  const cents = parseFloat((sqft / SQFT_PER_CENT).toFixed(4));
  const acres = parseFloat((sqft / SQFT_PER_ACRE).toFixed(4));
  const roundedSqft = parseFloat(sqft.toFixed(2));

  return {
    sqft: roundedSqft,
    sqm,
    cents,
    acres,
    formattedDisplay: `${sqm.toLocaleString('en-IN', { maximumFractionDigits: 2 })} m² | ${roundedSqft.toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.ft | ${cents.toFixed(4)} cents | ${acres.toFixed(4)} acres`,
  };
}

/**
 * Validates whether the entered plot area meets building type minimum requirements.
 */
export function validatePlotFeasibility(areaSqFt, buildingType = 'Individual House') {
  const btype = buildingType || 'Individual House';
  const rule = BUILDING_REQUIREMENTS[btype] || BUILDING_REQUIREMENTS['Individual House'];
  const minSqFt = rule.minSqFt;
  const actualSqFt = Math.max(0, parseFloat(areaSqFt) || 0);
  const isSufficient = actualSqFt >= minSqFt;
  const diffSqFt = Math.abs(actualSqFt - minSqFt);

  let message = '';
  if (isSufficient) {
    message = `Plot size (${actualSqFt.toLocaleString('en-IN')} sq.ft) is sufficient for ${btype} (surplus of ${diffSqFt.toLocaleString('en-IN', { maximumFractionDigits: 1 })} sq.ft).`;
  } else {
    message = `Plot size is too small for this building type. Entered plot size (${actualSqFt.toLocaleString('en-IN')} sq.ft) is below the minimum required ${minSqFt.toLocaleString('en-IN')} sq.ft for a ${btype} (deficit of ${diffSqFt.toLocaleString('en-IN', { maximumFractionDigits: 1 })} sq.ft).`;
  }

  return {
    buildingType: btype,
    minRequiredSqFt: minSqFt,
    actualSqFt,
    isSufficient,
    diffSqFt,
    status: isSufficient ? 'SUITABLE' : 'DEFICIT',
    message,
  };
}

/**
 * Calculates indicative construction cost breakdown.
 */
export function calculateConstructionCost(areaSqFt, buildingType = 'Individual House') {
  const btype = buildingType || 'Individual House';
  const rule = BUILDING_REQUIREMENTS[btype] || BUILDING_REQUIREMENTS['Individual House'];
  const actualSqFt = Math.max(0, parseFloat(areaSqFt) || 0);
  const ratePerSqFt = rule.rateInr;

  const totalEstimatedCost = Math.round(actualSqFt * ratePerSqFt);
  const materialCost = Math.round(totalEstimatedCost * 0.55);
  const labourCost = Math.round(totalEstimatedCost * 0.25);
  const finishingCost = Math.round(totalEstimatedCost * 0.20);

  return {
    buildingType: btype,
    areaSqFt: actualSqFt,
    ratePerSqFt,
    totalEstimatedCost,
    materialCost,
    labourCost,
    finishingCost,
    disclaimer: 'This is an indicative estimate, not an official quotation or government-approved construction rate.',
  };
}
