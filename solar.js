// Parse location display name from Nominatim response
function parseLocationName(nominatimData) {
    try {
        // Extract city and country from Nominatim address data
        const address = nominatimData.address;
        const city = address.city || address.town || address.village || address.suburb || address.municipality;
        const country = address.country;
        
        if (city && country) {
            return `${city}, ${country}`;
        }
        return nominatimData.display_name; // Fallback to full name if we can't parse it
    } catch (error) {
        console.error('Error parsing location name:', error);
        return nominatimData.display_name;
    }
}// Constants
const MINUTES_PER_DEGREE = 4; // Earth rotates 1° every 4 minutes

// Validate coordinates
function validateCoordinates(latitude, longitude) {
    return {
        latitude: Math.max(-90, Math.min(90, latitude)),
        longitude: Math.max(-180, Math.min(180, longitude))
    };
}

// Calculate the Local Standard Time Meridian (LSTM)
function calculateLSTM(timezone) {
    return 15 * timezone; // 15° = 360° / 24 hours
}

// Calculate the Equation of Time (EoT)
function calculateEoT(dayOfYear) {
    const B = (360 / 365) * (dayOfYear - 81);
    const B_rad = B * (Math.PI / 180); // Convert to radians
    return 9.87 * Math.sin(2 * B_rad) - 7.53 * Math.cos(B_rad) - 1.5 * Math.sin(B_rad);
}

// Calculate Time Correction Factor (TC)
function calculateTC(longitude, timezone, dayOfYear) {
    const lstm = calculateLSTM(timezone);
    const eot = calculateEoT(dayOfYear);
    return 4 * (longitude - lstm) + eot; // Result in minutes
}

// Get day of year
function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

// Convert decimal time to HH:MM:SS format
function formatTime(decimalHours) {
    let hours = Math.floor(decimalHours);
    // Handle overflow/underflow of hours
    hours = ((hours % 24) + 24) % 24;
    const minutes = Math.floor((decimalHours - Math.floor(decimalHours)) * 60);
    const seconds = Math.floor(((decimalHours - Math.floor(decimalHours)) * 60 - minutes) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Format time deviation into hours, minutes, and seconds
function formatDeviation(deviationMinutes) {
    const absoluteMinutes = Math.abs(deviationMinutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const remainingMinutes = absoluteMinutes % 60;
    const minutes = Math.floor(remainingMinutes);
    const seconds = Math.round((remainingMinutes - minutes) * 60);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    const direction = deviationMinutes >= 0 ? 'behind' : 'ahead';
    return `${parts.join(' ')} ${direction}`;
}

// Get timezone offset for given coordinates
async function getTimezoneOffset(latitude, longitude) {
    try {
        const response = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${latitude}&longitude=${longitude}`);
        const data = await response.json();
        return data.currentUtcOffset.seconds / 3600; // Convert seconds to hours
    } catch (error) {
        console.error('Error fetching timezone:', error);
        return null;
    }
}

// Get location from timeapi.io IP lookup
async function getLocationFromIP() {
    try {
        const response = await fetch('https://timeapi.io/api/Time/current/ip');
        const data = await response.json();
        
        // Check if we have valid city and country data
        if (!data.city || !data.countryName || data.city === 'undefined' || data.countryName === 'undefined') {
            console.error('Invalid location data from IP');
            return null;
        }
        
        return {
            latitude: data.latitude,
            longitude: data.longitude,
            display_name: `${data.city}, ${data.countryName}`
        };
    } catch (error) {
        console.error('Error getting location from IP:', error);
        return null;
    }
}

// Get location from browser's Geolocation API
function getBrowserLocation() {
    return new Promise((resolve) => {
        if ('geolocation' in navigator) {
            // Try to get location without showing a prompt
            navigator.permissions.query({ name: 'geolocation' })
                .then(async (permissionStatus) => {
                    if (permissionStatus.state === 'granted') {
                        navigator.geolocation.getCurrentPosition(async position => {
                            try {
                                const response = await fetch(
                                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
                                );
                                const data = await response.json();
                                resolve({
                                    latitude: position.coords.latitude,
                                    longitude: position.coords.longitude,
                                    display_name: parseLocationName(data)
                                });
                            } catch (error) {
                                resolve(null);
                            }
                        }, () => resolve(null));
                    } else {
                        resolve(null);
                    }
                })
                .catch(() => resolve(null));
        } else {
            resolve(null);
        }
    });
}

// Request current location explicitly (for the location button)
// Get current location using browser's Geolocation API
function getCurrentLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(async position => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            
            // Reverse geocode to get location name
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                );
                const data = await response.json();
                selectLocation({
                    display_name: parseLocationName(data),
                    lat: latitude,
                    lon: longitude
                });
            } catch (error) {
                console.error('Error reverse geocoding:', error);
            }
        }, error => {
            console.error('Error getting location:', error);
            document.getElementById('current-location').textContent = 
                'Location access unavailable. Please search for a location above.';
        });
    } else {
        document.getElementById('current-location').textContent = 
            'Geolocation is not supported by your browser. Please search for a location above.';
    }
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Search locations using Nominatim
async function searchLocations(query) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error searching locations:', error);
        return [];
    }
}

// Display search results
function displaySearchResults(results) {
    const searchResults = document.getElementById('search-results');
    searchResults.innerHTML = '';
    searchResults.style.display = results.length ? 'block' : 'none';

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = result.display_name;
        div.addEventListener('click', () => {
            selectLocation(result, true);  // true indicates explicit selection
            searchResults.style.display = 'none';
        });
        searchResults.appendChild(div);
    });
}

// Select a location
function selectLocation(location, isExplicitSelection = false) {
    const latitude = parseFloat(location.lat);
    const longitude = parseFloat(location.lon);
    
    // Update the hidden inputs
    document.getElementById('latitude').value = latitude;
    document.getElementById('longitude').value = longitude;
    
    // Only update the search input if explicitly selected (search or button click)
    if (isExplicitSelection) {
        document.getElementById('location-search').value = location.display_name;
    }
    
    // Update current location display if we have a valid name
    if (location.display_name && location.display_name !== 'undefined, undefined') {
        document.getElementById('current-location').textContent = location.display_name;
    } else {
        document.getElementById('current-location').textContent = '';
    }
    
    // Trigger time updates
    updateDisplays();
}

// Update displays
async function updateDisplays() {
    let latitude = parseFloat(document.getElementById('latitude').value);
    let longitude = parseFloat(document.getElementById('longitude').value);
    
    if (isNaN(latitude) || isNaN(longitude)) {
        return;
    }
    
    // Validate and constrain coordinates
    const coords = validateCoordinates(latitude, longitude);
    latitude = coords.latitude;
    longitude = coords.longitude;

    // Get timezone offset for the location
    const timezone = await getTimezoneOffset(latitude, longitude);
    if (timezone === null) {
        return;
    }

    // Get current UTC time
    const utcNow = new Date();
    const dayOfYear = getDayOfYear(utcNow);
    
    // Calculate local time at the given coordinates
    const localHours = (utcNow.getUTCHours() + timezone + 24) % 24 + 
                      utcNow.getUTCMinutes() / 60 + 
                      utcNow.getUTCSeconds() / 3600;
    
    // Calculate time correction
    const timeCorrection = calculateTC(longitude, timezone, dayOfYear);
    
    // Calculate Local Solar Time
    const solarTime = localHours + timeCorrection / 60;
    
    // Update displays
    document.getElementById('local-time').textContent = formatTime(localHours);
    document.getElementById('local-date').textContent = 
        new Date(utcNow.getTime() + timezone * 3600000).toLocaleDateString();
    
    // Only show solar time if we have longitude (not just timezone from IP)
    if (longitude !== null && !isNaN(longitude)) {
        document.getElementById('solar-time').textContent = formatTime(solarTime);
        document.getElementById('time-deviation').textContent = formatDeviation(timeCorrection);
    } else {
        document.getElementById('solar-time').textContent = '--:--:--';
        document.getElementById('time-deviation').textContent = '';
    }
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('location-search');
    const getCurrentLocationButton = document.getElementById('get-current-location');
    
    // Try to get location in order of preference
    const browserLocation = await getBrowserLocation();
    if (browserLocation) {
        selectLocation({
            display_name: browserLocation.display_name,
            lat: browserLocation.latitude,
            lon: browserLocation.longitude
        });
    } else {
        const ipLocation = await getLocationFromIP();
        if (ipLocation) {
            selectLocation({
                display_name: ipLocation.display_name,
                lat: ipLocation.latitude,
                lon: ipLocation.longitude
            });
        }
        // If neither method works, the time displays will remain at their default state
    }
    
    // Handle location search
    searchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        if (query.length < 3) {
            document.getElementById('search-results').style.display = 'none';
            return;
        }
        
        const results = await searchLocations(query);
        displaySearchResults(results);
    }, 300));
    
    // Handle current location button
    getCurrentLocationButton.addEventListener('click', getCurrentLocation);
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.location-input-container')) {
            document.getElementById('search-results').style.display = 'none';
        }
    });
    
    // Update time displays every second
    setInterval(updateDisplays, 1000);
});