/**
 * Haversine formula for calculating great-circle distance between two GPS coordinates
 * Earth radius ~ 6,371 km
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Radius of the Earth in km

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // Return distance rounded to 1 decimal place
  return Math.round(distance * 10) / 10;
}

/**
 * Estimate transit time by ambulance / medical van in rural Tamil Nadu
 * Assumes average road speed of 35-40 km/h with 1.25 road winding factor
 */
function estimateRoadTravel(crowDistanceKm) {
  const roadKm = Math.round(crowDistanceKm * 1.25 * 10) / 10;
  const minutes = Math.round((roadKm / 38) * 60);
  return {
    roadDistanceKm: roadKm,
    estimatedMinutes: Math.max(10, minutes)
  };
}

module.exports = {
  calculateHaversineDistance,
  estimateRoadTravel
};
