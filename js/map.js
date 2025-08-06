

const torontoCoordinates = [
    [-79.598730, 43.535249],  // Southwest corner  43.29533989308583, -80.27100851602646
    [-79.281109,43.535249 ],  // Southeast corner  44.21485569034258, -76.80905392564314
    [-79.281109, 43.800563],  // Northeast corner  45.56115625733724, -78.2029072029573
    [-79.651654, 43.709029],  // Northwest corner
];

torontoCoordinates.push(torontoCoordinates[0]); // Close polygon
const polygon = turf.polygon([torontoCoordinates]);
const sourceNode = [-79.5059, 43.6089]; // 43.70893215682713, -79.29598856856339
const dijkstraResults = [];
let marker = null;
let tempMarker = null;


// Global data holders
let nodeData = null;
let edgeData = null;
let idToCoordinates = new Map();
let sourceNodeId = null;
let checkValidNodes = null;
let graph = new graphlib.Graph({ directed: true });
drawPolygon_state = true;


// Example variable
let nearest_coord = 100; // Your variable
let max_distance = 5000; // Variable for max distance
let max_Edge = 700; // Maximum edge length for concave hull

// Set the input field value when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const nearestCoordInput = document.getElementById("nearest_Coord");
    if (nearestCoordInput) {
        nearestCoordInput.value = nearest_coord; // Use the variable value
    }
    
    const maxDistanceInput = document.getElementById("max_Distance");
    if (maxDistanceInput) {
        maxDistanceInput.value = max_distance;
    }
    const maxEdgeInput = document.getElementById("max_Edge");
    if (maxEdgeInput) {
        maxEdgeInput.value = max_Edge; // Use the variable value
    }
});

document.getElementById("max_Edge").addEventListener("input", (event) => {
    const newValue = parseFloat(event.target.value);
    if (!isNaN(newValue) && newValue >= 500) {
        max_Edge = newValue;
        console.log("🔄 max_Edge updated:", max_Edge);
    } else {
        console.warn("Invalid max_Edge entered.");
    }
});

document.getElementById("max_Distance").addEventListener("input", (event) => {
    const newValue = parseFloat(event.target.value);
    if (!isNaN(newValue) && newValue > 0) {
        max_distance = newValue;
        console.log("🔄 max_distance updated:", max_distance);
    } else {
        console.warn("Invalid max_distance entered.");
    }
});

document.getElementById("nearest_Coord").addEventListener("input",(event)=>{
    const newValue = parseFloat(event.target.value);
    if (!isNaN(newValue) && newValue > 0){
        nearest_coord = newValue;
        console.log("🔄 nearest_Coord updated:",nearest_coord);
    } else {
        console.warn("Invalid nearest_Coord entered");
    }
});


document.getElementById("pressButton").addEventListener("click", () => {
    const max_distance = parseFloat(document.getElementById("max_Distance").value);
    const nearest_coord = parseFloat(document.getElementById("nearest_Coord").value);
    const max_Edge = parseFloat(document.getElementById("max_Edge").value);
    console.log("📏 User-defined max_distance (meters):", max_distance);
    console.log("📏 User-defined nearest_coord (meters):", nearest_coord);
    if (isNaN(max_distance) || max_distance <= 0) {
        alert("Please enter a valid distance greater than 0");
        return;
    }
    if (isNaN(nearest_coord) || nearest_coord <= 0) {
        alert("Please enter a valid nearest_coord greater than 0");
        return;
    }
    if (isNaN(max_Edge) || max_Edge <= 0) {
        alert("Please enter a valid max_Edge greater than 0");
        return;
    }
    onMarkerDrag(marker);
});

document.getElementById("saveCSV").addEventListener("click",()=>{
})


function getClosestNodeId(coord, closest ) {
    let minDist1 = closest;
    let tempCoord = null;
    let findone = false;
        for (let [id, nodeCoord] of idToCoordinates.entries()) {
        const dist = turf.distance(turf.point(coord), turf.point(nodeCoord), { units: 'meters' });
                if (dist <= minDist1) {
            minDist1 = dist;
            closestId = id;
            tempCoord = nodeCoord;
            findone = true;
        }
    }
    if(!findone) {
        console.warn(`Closest node is ${minDist1.toFixed(2)}m away, which exceeds the ${closest}m threshold.`);
        return null;
    }        
    return closestId;
}

async function fetchGeoJSON(url) {
    const response = await fetch(url);
 

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    try {
        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder("utf-8");
        const text = decoder.decode(buffer);
    
        if (!text.trim()) {
            throw new Error(`Empty JSON file: ${url}`);
        }

        return JSON.parse(text);
    } catch (err) {
        throw new Error(`Error reading or parsing ${url}: ${err.message}`);
    }
}



async function loadInitialData() {
 
    if (nodeData && edgeData && idToCoordinates.size > 0) { 
        console.log("Data already loaded, skipping fetch.");
        return;
    }

   console.log("Loading data...");
    nodeData = await fetchGeoJSON("data/nodes_with_properties.geojson"); 
    edgeData = await fetchGeoJSON("data/edges_with_uv.geojson"); 

    
    prepareDataForGraph();
}

async function prepareDataForGraph() {
     const restrictedSet = new Set();
     nodeData.features.forEach(feature => {
        const id = feature.properties.osmid;
        const coords = feature.geometry.coordinates;
        idToCoordinates.set(id, coords);
      
  });
    nodeData.features.forEach(feature => {
        const point = turf.point(feature.geometry.coordinates);
        console.log("point", point);
        const id = feature.properties.osmid;
        console.log("id", id);
        if (turf.booleanPointInPolygon(point, polygon)) {
          restrictedSet.add(feature.properties.osmid);
          graph.setNode(id, {
            coordinates: feature.geometry.coordinates,
            properties: feature.properties
          });   
        }
    });
    
 console.time("prepareDataForGraph");
 edgeData.features.forEach(feature => {
        const { u, v, length } = feature.properties;
        if (graph.hasNode(u) && graph.hasNode(v)) {
            if (length !== null && typeof length === "number") {
                graph.setEdge(u, v, length);
              
            }
        }
    });
    console.timeEnd("prepareDataForGraph");

}

async function findRestrictedNodesOptimized(sourceNode, _max_distance, polygon) {
    await loadInitialData();
    
    console.time("dijkstra");
    const { result: rawshortestPaths, boundaryNodes } = dijkstraWithCutoff(graph, sourceNode, _max_distance);
    console.timeEnd("dijkstra");
    const boundaryPoints = Array.from(boundaryNodes).map(id => idToCoordinates.get(Number(id))).filter(Boolean);
    const shortestPaths = Object.keys(rawshortestPaths).map(id => idToCoordinates.get(Number(id))).filter(Boolean);
    return { result:shortestPaths, boundaryPoints };
}


async function clearPolygon(){
    if (map.getLayer("destination-polygon")) {
        
        map.removeLayer("destination-polygon");
        console.log("layer removed");
    }
    if(map.getLayer("destination-polygon-outline")){
        map.removeLayer("destination-polygon-outline");
    }


    if (map.getSource("destination-polygon")) {
        map.removeSource("destination-polygon");
        console.log("data source removed");
    }
    if (map.getLayer("polygon-vertex-dots")) {
        map.removeLayer("polygon-vertex-dots");
        console.log("polygon vertex dots layer removed");
    }
    if (map.getSource("polygon-vertices")) {
        map.removeSource("polygon-vertices");
        console.log("polygon vertices data source removed");
    }

}
async function drawPolygon(validPoints) {
    if (!Array.isArray(validPoints) || validPoints.length < 3) {
        console.warn("Not enough points to form a polygon.");
        return;
    }

   
    clearPolygon();
    const pointsFeature = turf.featureCollection(
        validPoints.map(coord => turf.point(coord))
    );

    //const convexPolygon = turf.convex(pointsFeature);
    const concavePolygon = turf.concave(pointsFeature, { maxEdge: max_Edge, units: 'meters'}); 
    if (concavePolygon) {
       

        map.addSource("destination-polygon", {
            type: "geojson",
            data: concavePolygon
        });

        map.addLayer({
            id: "destination-polygon",
            type: "fill",
            source: "destination-polygon",
            layout: {},
            paint: {
                "fill-color": "#088",
                "fill-opacity": 0.5
            }
        });

        map.addLayer({
            id: "destination-polygon-outline",
            type: "line",
            source: "destination-polygon",
            layout: {},
            paint: {
                "line-color": "#000", // black outline
                "line-width": 1
            }
        });
        const simplified = turf.simplify(concavePolygon, { tolerance: 0.001, highQuality: true });
        const coords = simplified.geometry.coordinates[0];

       const vertexPoints = turf.featureCollection(
           coords.map(coord => turf.point(coord))
);

        const polygonVertices = turf.featureCollection(
             concavePolygon.geometry.coordinates[0].map(coord => turf.point(coord))
        );
        map.addSource("polygon-vertices", {
            type: "geojson",
            data: polygonVertices
        });
        map.addLayer({
            id: "polygon-vertex-dots",
            type: "circle",
            source: "polygon-vertices",
            paint: {
                "circle-radius": 6,               // make it big
                "circle-color": "#FF0000",        // red
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#FFFFFF"  // white outline for visibility
            }
        });
    } else {
        console.warn("Could not generate polygon.");
    }
}


async function onMarkerDrag(marker) {
    if (!nodeData) {
        console.error('GeoJSON data is not yet loaded');
        return;
    }
    const markerPosition = marker.getLngLat();
    console.log("before getClosestNodeId ",nearest_coord);
    const sourceNodeId = getClosestNodeId([markerPosition.lng, markerPosition.lat], nearest_coord);
    console.log("marker = ",marker);
    console.log("📍 New sourceNodeId:", sourceNodeId);
    if (sourceNodeId === null) {
        console.warn("No valid road network node found near the marker location. Please move the marker closer to a road.");
        marker.getElement().style.backgroundColor = '#ff4444'; // Red color
        clearPolygon();
        return;
    } else {
    marker.getElement().style.backgroundColor = '#3bb2d0'; // Default blue color
    }
        
    console.time("findRestrictedNodesOptimized");
    const { result: shortestPaths, boundaryPoints } = await findRestrictedNodesOptimized(sourceNodeId, max_distance, polygon);
    console.timeEnd("findRestrictedNodesOptimized");
    console.time("drawPolygon");
    drawPolygon(shortestPaths);
    console.timeEnd("drawPolygon");
}

// Initialize Mapbox
mapboxgl.accessToken = 'pk.eyJ1Ijoibm1laGRpMTYiLCJhIjoiY2wzNWFpa3hsMHZvMTNkcGFzbDY4c2J0NCJ9.FwTKEGl5RmTewoCuzSnhtQ';

const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v11",
    center: [-79.3832, 43.6532],
    zoom: 8 // City-level zoom
});




map.on('load', async () => {
  
    await loadInitialData();
    map.addSource('toronto-polygon', {
        type: 'geojson',
        data: polygon
    });

    // Add the polygon layer to the map
    map.addLayer({
        id: 'toronto-polygon-fill',
        type: 'fill',
        source: 'toronto-polygon',
        layout: {},
        paint: {
            'fill-color': 'rgba(0, 0, 0, 0.3)', // Fill color
            'fill-opacity': 0.5 // Fill opacity
        }
    });

    // Add the border (line) layer
    map.addLayer({
        id: 'toronto-polygon-line',
        type: 'line',
        source: 'toronto-polygon',
        layout: {},
        paint: {
            'line-color': 'red', // Border color
            'line-width': 4 // Border width
        }
    });

    // Add the draggable marker
      marker = new mapboxgl.Marker({ draggable: true })
        .setLngLat(sourceNode) // Initial marker position
        .addTo(map);
      

        await onMarkerDrag(marker);

    // Check if the new position of the marker is inside the polygon
    marker.on('drag', function () {
        const markerPosition = marker.getLngLat();
        const point = turf.point([markerPosition.lng, markerPosition.lat]);
        
        // If the marker position is outside the polygon, move it back
        if (!turf.booleanPointInPolygon(point, polygon)) {
            marker.setLngLat(sourceNode); // Reset marker position to the initial point
        }
        onMarkerDrag(marker);
    });

    
});




function reconstructPath(shortestPaths, sourceNode, targetNode) {
    const path = [];
    let current = targetNode;

    while (current !== undefined && current !== null) {
        path.unshift(current);
        if (current === sourceNode) break;
        current = shortestPaths[current]?.predecessor;
    }

    // If the loop didn't reach the sourceNode, it's unreachable
    if (path[0] !== sourceNode) return null;

    return path;
}

function printAllShortestPath(shortestPaths){
    console.log("printAllShortestPath");
    
    for (const target in shortestPaths) {
        if (target === String(sourceNode)) continue;
    
        const path = reconstructPath(shortestPaths, sourceNode, target);
        const distance = shortestPaths[target].distance;
    
        if (path) {
            console.log(`Path to ${target}: ${path.join(" → ")} (Distance: ${distance})`);
        } else {
            console.log(`No path to ${target}`);
        }
    }
    
}

function dijkstraWithCutoff(graph, sourceNode, maxDistance, propertyName = "weight") {
    const dist = {};
    const prev = {};
    const result = {};
    const boundaryNodes = new Set();

    const heap = new MinHeap("distance");
 
    graph.nodes().forEach(node => {
        dist[node] = Infinity;
        prev[node] = null;
    });

    dist[sourceNode] = 0;

    heap.insert({ node: sourceNode, distance: 0 });
   
    while (!heap.isEmpty()) {
        const { node: u, distance: currentDist } = heap.extractMin();

        if (result[u]) continue; 
        if (currentDist > maxDistance) break;

        result[u] = {
            distance: currentDist,
            predecessor: prev[u]
        };

        const neighbors = graph.successors(u);
        if (!neighbors) {
            boundaryNodes.add(u);
            continue;
        }
        let isBoundary = true; // Assume it's a boundary until proven otherwise

        for (const v of neighbors) {
            const weight = graph.edge(u, v);
            if (typeof weight !== "number") continue;
            const alt = currentDist + weight;
            if (alt <= maxDistance) {
                isBoundary = false; // Can go further, not a boundary
                if (alt < dist[v]) {
                    dist[v] = alt;
                    prev[v] = u;
                    heap.insert({ node: v, distance: alt });
                }
            }
        }

        if (isBoundary) {
            boundaryNodes.add(u);
        }
    }
//   console.log("boundaryNodes", boundaryNodes);
//   console.log("result", result);
    // Map boundary node IDs to coordinates
    // const boundaryPoints = Array.from(boundaryNodes).map(id => idToCoordinates.get(Number(id))).filter(Boolean);
    // const reachableNodeIds = Object.keys(result);
    // const reachableCoords = reachableNodeIds.map(id => idToCoordinates.get(Number(id))).filter(Boolean);
    // const boundaryCoords = Array.from(boundaryNodes).map(id => idToCoordinates.get(Number(id))).filter(Boolean);

    
    return {
        result,
        boundaryNodes
    };
}



function reconstructPath(prev, targetNode) {
    const path = [];
    let current = targetNode;

    while (current !== null) {
        path.unshift(current);
        current = prev[current];
    }

    return path;
}



class MinHeap {
    constructor(priorityField = "priority") {
        this.heap = [];
        this.priorityField = priorityField;
    }

    _parent(i) { return Math.floor((i - 1) / 2); }
    _left(i) { return 2 * i + 1; }
    _right(i) { return 2 * i + 2; }

    _swap(i, j) {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }

    _compare(i, j) {
        return this.heap[i][this.priorityField] < this.heap[j][this.priorityField];
    }

    insert(item) {
        this.heap.push(item);
        this._heapifyUp(this.heap.length - 1);
    }

    extractMin() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();

        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this._heapifyDown(0);
        return min;
    }

    _heapifyUp(i) {
        while (i > 0 && this._compare(i, this._parent(i))) {
            this._swap(i, this._parent(i));
            i = this._parent(i);
        }
    }

    _heapifyDown(i) {
        const size = this.heap.length;
        while (true) {
            const left = this._left(i);
            const right = this._right(i);
            let smallest = i;

            if (left < size && this._compare(left, smallest)) smallest = left;
            if (right < size && this._compare(right, smallest)) smallest = right;

            if (smallest !== i) {
                this._swap(i, smallest);
                i = smallest;
            } else {
                break;
            }
        }
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    size() {
        return this.heap.length;
    }

    peek() {
        return this.heap[0];
    }
}

// Function to create input with variable value
function createInputWithValue() {
    const defaultValue = max_distance;
    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'max_Distance';
    input.value = defaultValue;
    input.min = '100';
    input.max = '10000';
    input.step = '100';
    
    // Add to page (you can specify where to append it)
    const container = document.getElementById('controls') || document.body;
    container.appendChild(input);
}


// Function to create input with variable x
function createInputWithVariable() {
    const inputHTML = `<input type="number" id="nearest_coord" value="${nearest_coord}" />`;
    
    // Add to page
    const container = document.getElementById('controls') || document.body;
    container.innerHTML += inputHTML;
}

// Call this function when needed
// createInputWithVariable();
