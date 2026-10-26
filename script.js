

const API_URL = "/api/properties";

let map;
let markersLayer;
let allProperties = [];
let mapPlaces = [];
let currentLocation = null;
let searchRequestId = 0;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  initializeMap();
  loadDatabaseProperties();

  $("searchForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    searchLocation();
  });

  $("clearBtn")?.addEventListener("click", clearFilters);
  $("locationBtn")?.addEventListener("click", useMyLocation);
  $("typeFilter")?.addEventListener("change", renderProperties);
  $("genderFilter")?.addEventListener("change", renderProperties);
  $("budgetFilter")?.addEventListener("change", renderProperties);
  $("foodFilter")?.addEventListener("change", renderProperties);

  $("openMapBtn")?.addEventListener("click", () => {
    if (currentLocation) {
      window.open(
        `https://www.openstreetmap.org/#map=15/${currentLocation.lat}/${currentLocation.lon}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  });

  $("closeDialog")?.addEventListener("click", () => {
    $("detailsDialog")?.close();
  });
});

function setStatus(message) {
  const status = $("status");
  if (status) status.textContent = message;
}

function initializeMap() {
  if (!window.L || !$("map")) {
    setStatus("The map library could not load. Check your internet connection.");
    return;
  }

  map = L.map("map").setView([12.9716, 77.5946], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

async function loadDatabaseProperties() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    // Accept the common API response formats.
    if (Array.isArray(data)) {
      allProperties = data;
    } else if (Array.isArray(data.properties)) {
      allProperties = data.properties;
    } else if (Array.isArray(data.data)) {
      allProperties = data.data;
    } else {
      console.error("Unexpected API response format:", data);
      allProperties = [];
    }

    console.log("NearNest loaded properties:", allProperties.length, allProperties);

    renderProperties();

    if (allProperties.length === 0) {
      setStatus("No saved properties were returned by the API.");
    }
  } catch (error) {
    console.error("NearNest API error:", error);
    setStatus("Could not load saved listings. Check the backend terminal.");
  }
}

async function searchLocation() {
  const query = $("locationInput")?.value.trim();

  if (!query) {
    setStatus("Enter a city, neighbourhood, landmark or PIN code first.");
    $("locationInput")?.focus();
    return;
  }

  const requestId = ++searchRequestId;
  mapPlaces = [];
  markersLayer?.clearLayers();

  if ($("areaSection")) $("areaSection").hidden = true;
  if ($("openMapBtn")) $("openMapBtn").disabled = true;

  setStatus(`Searching for accommodation around ${query}…`);

  try {
    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
    );

    if (!geoResponse.ok) throw new Error("Location lookup failed.");

    const locations = await geoResponse.json();

    if (requestId !== searchRequestId) return;

    if (!locations.length) {
      setStatus("Location not found. Try a different area or PIN code.");
      mapPlaces = [];
      renderProperties();
      return;
    }

    const location = locations[0];

    currentLocation = {
      lat: Number(location.lat),
      lon: Number(location.lon),
      name: location.display_name
    };

    map?.setView([currentLocation.lat, currentLocation.lon], 14);

    showAreaInformation(location);
    if ($("openMapBtn")) $("openMapBtn").disabled = false;

    const radius = 3500;
    const lat = currentLocation.lat;
    const lon = currentLocation.lon;

    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["tourism"~"hostel|guest_house|hotel|motel|apartment"](around:${radius},${lat},${lon});
        way["tourism"~"hostel|guest_house|hotel|motel|apartment"](around:${radius},${lat},${lon});
        relation["tourism"~"hostel|guest_house|hotel|motel|apartment"](around:${radius},${lat},${lon});
        node["amenity"="hostel"](around:${radius},${lat},${lon});
        way["amenity"="hostel"](around:${radius},${lat},${lon});
        node["building"="apartments"](around:${radius},${lat},${lon});
        way["building"="apartments"](around:${radius},${lat},${lon});
      );
      out center tags;
    `;

    let response;
    let results;

    try {
      response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "data=" + encodeURIComponent(overpassQuery)
      });

      if (!response.ok) throw new Error("Primary map data server unavailable.");
      results = await response.json();
    } catch (firstError) {
      console.warn("Trying backup OpenStreetMap server:", firstError);

      response = await fetch("https://overpass.kumi.systems/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "data=" + encodeURIComponent(overpassQuery)
      });

      if (!response.ok) throw new Error("Map data servers are temporarily unavailable.");
      results = await response.json();
    }

    if (requestId !== searchRequestId) return;

    mapPlaces = (results.elements || [])
      .map(normalizeMapPlace)
      .filter((place) => place.name && place.lat != null && place.lon != null);

    const unique = new Map();
    mapPlaces.forEach((place) => {
      unique.set(`${place.name.toLowerCase()}-${place.lat.toFixed(4)}-${place.lon.toFixed(4)}`, place);
    });
    mapPlaces = [...unique.values()];

    renderMarkers();
    renderProperties();

    if (mapPlaces.length) {
      setStatus(`Found ${mapPlaces.length} mapped accommodation places near ${query}. Rent and vacancy must be confirmed directly.`);
    } else {
      setStatus(`No accommodation was mapped near ${query}. Try a nearby area; OpenStreetMap coverage varies.`);
    }
  } catch (error) {
    console.error("Location search error:", error);
    if (requestId !== searchRequestId) return;
    setStatus("Could not load mapped stays right now. Please try again in a moment.");
    mapPlaces = [];
    renderProperties();
  }
}

function normalizeMapPlace(element) {
  const tags = element.tags || {};
  const coords = element.center || element;

  let type = tags.tourism || tags.amenity || tags.building || "other";
  type = normalizeType(type);

  return {
    id: `osm-${element.type}-${element.id}`,
    source: "OpenStreetMap",
    name: tags.name || tags["name:en"] || tags.brand || "",
    type,
    gender: "Not specified",
    rent: null,
    food: null,
    lat: Number(coords.lat),
    lon: Number(coords.lon),
    address: [
      tags["addr:suburb"],
      tags["addr:city"] || tags["addr:town"] || tags["addr:village"]
    ].filter(Boolean).join(", "),
    imageUrl: "",
    mapUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    tags
  };
}

function normalizeType(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("hostel")) return "hostel";
  if (text.includes("guest_house") || text.includes("guest house")) return "guest_house";
  if (text.includes("hotel") || text.includes("motel")) return "hotel";
  if (text.includes("apartment")) return "apartment";

  return "other";
}

function showAreaInformation(location) {
  const section = $("areaSection");
  if (!section) return;

  section.hidden = false;

  if ($("areaTitle")) {
    $("areaTitle").textContent = location.name?.split(",")[0] || "Your search area";
  }

  if ($("areaDescription")) {
    $("areaDescription").textContent =
      "Explore mapped accommodation nearby. Prices and availability are not verified by NearNest.";
  }

  if ($("areaSource")) {
    $("areaSource").href =
      `https://www.openstreetmap.org/#map=14/${location.lat}/${location.lon}`;
  }
}

function renderMarkers() {
  if (!map || !markersLayer) return;

  markersLayer.clearLayers();

  mapPlaces.forEach((place) => {
    const marker = L.marker([place.lat, place.lon]).addTo(markersLayer);

    marker.bindPopup(`
      <strong>${escapeHTML(place.name)}</strong>
      <br>${escapeHTML(typeLabel(place.type))}
      <br><small>Rent and availability not verified</small>
      <br><a href="${place.mapUrl}" target="_blank" rel="noopener noreferrer">View on OpenStreetMap</a>
    `);
  });
}

function getPropertyImage(place) {
  // Use a real image URL from a saved listing when one is available.
  if (place.imageUrl && /^https?:\/\//i.test(place.imageUrl)) return place.imageUrl;

  // These are illustrative accommodation photos, not verified photos of the mapped place.
  const images = {
    hostel: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80",
    guest_house: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=900&q=80",
    hotel: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
    apartment: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80",
    other: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=900&q=80"
  };
  return images[place.type] || images.other;
}

function renderProperties() {
  const grid = $("propertyGrid");
  if (!grid) return;

  const typeFilter = $("typeFilter")?.value || "all";
  const genderFilter = $("genderFilter")?.value || "all";
  const budgetFilter = $("budgetFilter")?.value || "all";
  const foodFilter = $("foodFilter")?.value || "all";

  const combined = [...allProperties.map(normalizeDatabasePlace), ...mapPlaces];
  const unique = new Map();

  combined.forEach((place) => {
    const key = place.id || `${place.name}-${place.lat}-${place.lon}`;
    unique.set(String(key), place);
  });

  const filtered = [...unique.values()].filter((place) => {
    console.log("FILTER TEST:", {
  typeFilter,
  genderFilter,
  budgetFilter,
  foodFilter,
  properties: [...unique.values()].map(p => ({
    name: p.name,
    type: p.type,
    gender: p.gender,
    rent: p.rent,
    food: p.food
  }))
});
    if (typeFilter !== "all" && place.type !== typeFilter) return false;
    if (genderFilter !== "all" && normalizeGender(place.gender) !== genderFilter) return false;
    if (budgetFilter !== "all" && (place.rent == null || Number(place.rent) > Number(budgetFilter))) return false;
    if (foodFilter === "yes" && place.food !== true) return false;
    if (foodFilter === "no" && place.food !== false) return false;
    return true;
  });

  const count = $("resultCount");
  if (count) count.textContent = `${filtered.length} stays`;

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⌕</span>
        <h3>No matching stays found</h3>
        <p>Try clearing your filters or searching another area.</p>
        <button class="button button-outline" type="button" id="emptyClearBtn">Clear filters</button>
      </div>
    `;
    $("emptyClearBtn")?.addEventListener("click", clearFilters);
    return;
  }

  grid.innerHTML = filtered.map((place) => {
    const imageUrl = getPropertyImage(place);
    const rent = place.rent != null
      ? `₹${Number(place.rent).toLocaleString("en-IN")}/month`
      : "Rent not listed";
    const gender = normalizeGender(place.gender);
    const sourceLabel = place.source === "OpenStreetMap"
      ? "Mapped place · verify details"
      : "Saved listing";
    const imageNote = place.imageUrl
      ? ""
      : `<span class="photo-note">Illustrative photo</span>`;

    return `
      <article class="property-card">
        <div class="property-photo" style="background-image: url('${escapeHTML(imageUrl)}')" role="img" aria-label="Illustrative accommodation photo">
          ${imageNote}
          <span class="place-badge">${escapeHTML(typeLabel(place.type))}</span>
        </div>
        <div class="property-body">
          <h3>${escapeHTML(place.name || "Accommodation")}</h3>
          <p class="property-area">${escapeHTML(place.address || "Location details unavailable")}</p>
          <div class="property-facts">
            <span class="fact">${escapeHTML(gender)}</span>
            <span class="fact">${escapeHTML(rent)}</span>
            <span class="fact">${place.food === true ? "Food available" : place.food === false ? "No food listed" : "Food not specified"}</span>
          </div>
          <div class="card-bottom">
            <span class="property-source">${escapeHTML(sourceLabel)}</span>
            <button class="details-btn" type="button" data-place-id="${escapeHTML(String(place.id))}">View details</button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  grid.querySelectorAll("[data-place-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const place = filtered.find((item) => String(item.id) === button.dataset.placeId);
      if (place) showDetails(place);
    });
  });
}

function normalizeDatabasePlace(place) {
  const rentValue = place.rent ?? place.monthlyRent ?? place.price ?? null;
  const numericRent = rentValue == null ? null : Number(String(rentValue).replace(/[^\d.]/g, ""));

  return {
    ...place,
    id: place._id || place.id || `db-${place.name}`,
    name: place.name || place.title || "Accommodation",
    source: "MongoDB",
    type: normalizeType(place.type || place.accommodationType || place.category),
    gender: normalizeGender(place.gender || place.genderPreference || place.stayPreference),
    rent: Number.isFinite(numericRent) ? numericRent : null,
    food: typeof place.food === "boolean" ? place.food :
      typeof place.foodAvailable === "boolean" ? place.foodAvailable : null,
    imageUrl: place.imageUrl || place.image || "",
    address: place.address || place.location || place.area || ""
  };
}

function normalizeGender(value) {
  const text = String(value || "").toLowerCase();

  if (text.includes("girl") || text.includes("female") || text.includes("women")) return "Girls";
  if (text.includes("boy") || text.includes("male") || text.includes("men")) return "Boys";
  if (text.includes("co-liv") || text.includes("coliv") || text.includes("mixed") || text.includes("unisex")) return "Co-living";

  return "Not specified";
}

function typeLabel(type) {
  return ({
    hostel: "Hostel",
    guest_house: "Guest house",
    hotel: "Hotel",
    apartment: "Apartment",
    other: "Other mapped stay"
  })[type] || "Accommodation";
}

function showDetails(place) {
  const dialog = $("detailsDialog");
  const content = $("detailsContent");
  if (!dialog || !content) return;

  const rent = place.rent != null
    ? `₹${Number(place.rent).toLocaleString("en-IN")}/month`
    : "Not listed";

  content.innerHTML = `
    <h2>${escapeHTML(place.name)}</h2>
    <p><strong>Type:</strong> ${escapeHTML(typeLabel(place.type))}</p>
    <p><strong>Area:</strong> ${escapeHTML(place.address || "Not specified")}</p>
    <p><strong>Monthly rent:</strong> ${escapeHTML(rent)}</p>
    <p><strong>Stay preference:</strong> ${escapeHTML(place.gender || "Not specified")}</p>
    <p><strong>Food:</strong> ${place.food === true ? "Available" : place.food === false ? "Not listed as available" : "Unknown"}</p>
    <p>Confirm price, vacancy, safety and occupancy rules directly with the provider.</p>
    ${place.mapUrl ? `<p><a href="${place.mapUrl}" target="_blank" rel="noopener noreferrer">Open map listing ↗</a></p>` : ""}
  `;

  if (typeof dialog.showModal === "function") dialog.showModal();
  else content.scrollIntoView({ behavior: "smooth" });
}

function clearFilters() {
  if ($("typeFilter")) $("typeFilter").value = "all";
  if ($("genderFilter")) $("genderFilter").value = "all";
  if ($("budgetFilter")) $("budgetFilter").value = "all";
  if ($("foodFilter")) $("foodFilter").value = "all";

  renderProperties();
  setStatus("Filters cleared. Search a location to discover mapped places.");
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Your browser does not support location access.");
    return;
  }

  setStatus("Requesting permission to use your location…");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      currentLocation = { lat: latitude, lon: longitude, name: "Your location" };

      if (map) map.setView([latitude, longitude], 14);
      if ($("locationInput")) $("locationInput").value = `${latitude}, ${longitude}`;

      searchLocation();
    },
    (error) => {
      console.warn("Location permission error:", error);
      setStatus("Location access was unavailable. You can enter a city or area instead.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
