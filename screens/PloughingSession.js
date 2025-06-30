import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as turf from '@turf/turf';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ploughWidth = 2; // meters

export default function PloughingScreen({ route, navigation }) {
  const { farmer, boundaryCoords, fieldArea, geojson } = route.params;
  const mapRef = useRef();

  const [region, setRegion] = useState(null);
  const [gridCells, setGridCells] = useState([]);
  const cellCounts = useRef(new Map());
  const [ploughing, setPloughing] = useState(false);
  const [ploughedArea, setPloughedArea] = useState(0);
  const [progress, setProgress] = useState(0);

  // Setup field grid
  const turfBoundary = useMemo(() => {
    const ring = boundaryCoords.map(c => [c.longitude, c.latitude]);
    ring.push(ring[0]);
    return turf.polygon([ring]);
  }, [boundaryCoords]);

  // Divide into grid
  useEffect(() => {
    if (turfBoundary) {
      const bbox = turf.bbox(turfBoundary);
      const cellSize = ploughWidth / 1000 / 2; // km
      const grid = turf.squareGrid(bbox, cellSize, { units:'kilometers' });
      const inside = grid.features.filter(f => turf.booleanIntersects(f, turfBoundary));
      setGridCells(inside.map((f,i)=> ({ id:i, feature:f })));
    }
  }, [turfBoundary]);

  // Map region (center on field)
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        setRegion({ ...loc.coords, latitudeDelta: 0.003, longitudeDelta: 0.003 });
      }
    })();
  }, []);

  // Restore plough session if interrupted
  useEffect(() => {
    AsyncStorage.getItem('lastPloughSession').then(d => {
      if (d) {
        const { ploughedArea, progress, cells } = JSON.parse(d);
        setPloughedArea(ploughedArea);
        setProgress(progress);
        if (cells) {
          cells.forEach(([id,count]) => cellCounts.current.set(id,count));
        }
      }
    });
  }, []);

  // Add this function inside your PloughingScreen component or as a helper
const submitPloughingSession = async () => {
  try {
    const res = await fetch('https://script.google.com/macros/s/AKfycbwoOdpKTRjgYi_g_VbqOSOx0XUPf1FbjFKw-jptAF55SS_JdLkV36R13blnePhdX60LMA/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        farmId: farmer.id,
        farmerName: farmer.name,
        ploughedArea,
        fieldArea,
        progress,
        timestamp: new Date().toISOString(),
        // Add more fields as needed (e.g., geojson, boundaryCoords)
      }),
    });
    const data = await res.json();
    if (data.result === 'success') {
      Alert.alert('Success', 'Ploughing session saved!');
    } else {
      Alert.alert('Error', 'Failed to save ploughing session.');
    }
  } catch (e) {
    Alert.alert('Error', 'Failed to connect to Google Sheets.');
  }
};

  // GPS tracking and cell updates
  const locationSub = useRef();
  const togglePlough = async () => {
    if (!ploughing) {
      cellCounts.current.clear();
      setPloughedArea(0);
      setProgress(0);
      setPloughing(true);
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 600, distanceInterval: 0.3 },
        loc => {
          if (!loc?.coords || loc.coords.accuracy > 12) return;
          const pt = turf.point([loc.coords.longitude, loc.coords.latitude]);
          let updated = false;
          for (let {id,feature} of gridCells) {
            if (turf.booleanPointInPolygon(pt,feature)) {
              if (!cellCounts.current.has(id)) updated = true;
              cellCounts.current.set(id, (cellCounts.current.get(id)||0)+1);
              break;
            }
          }
          if (updated) {
            const visited = cellCounts.current.size;
            const cellArea = Math.pow(ploughWidth/2,2) / 4046.86;
            const covered = visited * cellArea;
            setPloughedArea(covered);
            setProgress(Math.min(covered / fieldArea, 1));
            // Save progress to AsyncStorage
            AsyncStorage.setItem('lastPloughSession', JSON.stringify({
              ploughedArea: covered, progress: Math.min(covered / fieldArea,1),
              cells: Array.from(cellCounts.current.entries()),
            }));
          }
        }
      );
    } else {
      locationSub.current?.remove();
      setPloughing(false);
      AsyncStorage.removeItem('lastPloughSession');
      await submitPloughingSession();
    }
  };

  if(!region) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map} region={region} showsUserLocation>
        <Polygon coordinates={boundaryCoords} strokeColor="green" fillColor="rgba(0,180,0,0.15)" />
        {ploughing && gridCells.map(({id,feature})=>{
          const count=cellCounts.current.get(id)||0;
          if(!count) return null;
          const coords=feature.geometry.coordinates[0].map(([lng,lat])=>({latitude:lat,longitude:lng}));
          return <Polygon key={id} coordinates={coords} fillColor={count>1?'rgba(255,80,80,0.5)':'rgba(0,200,0,0.3)'} strokeWidth={0}/>;
        })}
      </MapView>
      <View style={styles.info}>
        <Text>Farmer: {farmer.name}</Text>
        <Text>Field Area: {fieldArea.toFixed(2)} ac</Text>
        <Text>Plough Width: {ploughWidth} m</Text>
        <Button title={ploughing?'Stop':'Start'} onPress={togglePlough} color={ploughing?'red':'green'} />
        <Text style={{marginTop:10}}>Ploughed: {ploughedArea.toFixed(2)} ac</Text>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, {width: `${(progress*100).toFixed(1)}%`, backgroundColor: progress>=1 ? '#2ecc40' : '#ffbd2f'}]} />
        </View>
        <Text>{(progress*100).toFixed(1)}% Complete</Text>
        <Button title="Export GeoJSON" color="#2980ff" onPress={() => {
          // Export boundary + ploughed grid as GeoJSON string
          const features = [
            geojson,
            ...gridCells.filter(({id})=>cellCounts.current.has(id)).map(({feature})=>feature)
          ];
          const out = { type: 'FeatureCollection', features };
          Alert.alert("GeoJSON Export", JSON.stringify(out, null, 2).slice(0,800)+"...");
        }} />
      </View>
    </View>
  );
}

const styles=StyleSheet.create({
  container:{flex:1}, map:{flex:1},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  info:{
    position:'absolute', bottom:10, left:10, right:10, backgroundColor:'#fff',
    padding:10, borderRadius:8, alignItems:'center', elevation:4
  },
  progressBarContainer: { width: '90%', height: 14, backgroundColor: '#eee', borderRadius: 7, marginVertical: 8 },
  progressBar: { height: '100%', borderRadius: 7 },
});