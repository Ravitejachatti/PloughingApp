import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import MapView, { Polygon, Marker } from 'react-native-maps';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BoundaryScreen({ route, navigation }) {
  const { farmer } = route.params;
  const mapRef = useRef(null);
  const locationSub = useRef(null);

  const [region, setRegion] = useState(null);
  const [coords, setCoords] = useState([]);
  const [area, setArea] = useState(0);
  const [mode, setMode] = useState('manual');
  const [autoCapturing, setAutoCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Restore unfinished boundary if exists
  useEffect(() => {
    AsyncStorage.getItem('lastBoundary').then(data => {
      if (data) {
        const { coords, area } = JSON.parse(data);
        setCoords(coords);
        setArea(area);
      }
    });
  }, []);

  // Get user location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location permission is needed.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002,
      });
    })();
    return () => locationSub.current?.remove?.();
  }, []);

  // Calculate area & check shape validity
  useEffect(() => {
    if (coords.length >= 3) {
      const ring = coords.map(c => [c.longitude, c.latitude]);
      ring.push(ring[0]);
      const polygon = turf.polygon([ring]);
      const kinks = turf.kinks(polygon);
      if (kinks.features.length > 0) {
        Alert.alert('Invalid Shape', 'Boundary is self-intersecting. Please undo or reset.');
        setArea(0);
        return;
      }
      const sqm = turf.area(polygon);
      setArea(sqm / 4046.8564224); // acres
      // Save draft to AsyncStorage
      AsyncStorage.setItem('lastBoundary', JSON.stringify({ coords, area: sqm / 4046.8564224 }));
    } else {
      setArea(0);
    }
  }, [coords]);

  // Add boundary point
  const addPoint = (pt) => {
    setCoords(prev => [...prev, pt]);
  };

  // Map tap for manual mode
  const onMapPress = ({ nativeEvent: { coordinate } }) => {
    if (mode === 'manual') addPoint(coordinate);
  };

  // Auto capture
  const prevHeadingRef = useRef(null);
  const startAuto = async () => {
    if (autoCapturing) return;
    setAutoCapturing(true);
    prevHeadingRef.current = null;
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 800, distanceInterval: 0.4 },
      loc => {
        if (!loc?.coords) return;
        if (loc.coords.accuracy > 12) return; // ignore poor GPS
        const { latitude, longitude, heading } = loc.coords;
        if (
          prevHeadingRef.current === null ||
          Math.abs(heading - prevHeadingRef.current) > 30
        ) {
          addPoint({ latitude, longitude });
          prevHeadingRef.current = heading;
        }
      }
    );
  };
  const stopAuto = () => {
    locationSub.current?.remove?.();
    setAutoCapturing(false);
  };

  // Undo/reset logic
  const undo = () => setCoords(c => c.slice(0, -1));
  const reset = () => { setCoords([]); setArea(0); AsyncStorage.removeItem('lastBoundary'); };

  // Complete boundary, export and move on
  const onFinish = async () => {
    if (coords.length < 3 || area === 0) {
      Alert.alert('Validation', 'Please define at least 3 valid boundary points.');
      return;
    }
    setSaving(true);
    // Export boundary as GeoJSON (optional, for share/export)
    const ring = coords.map(c => [c.longitude, c.latitude]);
    ring.push(ring[0]);
    const geojson = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { farmer }
    };
    await AsyncStorage.removeItem('lastBoundary');
    setSaving(false);
    navigation.replace('Plough', { farmer, boundaryCoords: coords, fieldArea: area, geojson });
  };

  if (!region) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Acquiring your location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        ref={mapRef}
        showsUserLocation
        onPress={onMapPress}
      >
        {coords.length >= 2 && (
          <Polygon
            coordinates={coords}
            strokeColor="green"
            fillColor="rgba(0,180,0,0.2)"
            strokeWidth={2}
          />
        )}
        {coords.length > 0 && (
          <Marker coordinate={coords[0]} pinColor="orange" title="Start" />
        )}
        {coords.map((pt, i) => (
          <Marker key={i} coordinate={pt} pinColor="#bbb" />
        ))}
      </MapView>

      <View style={styles.modeSwitch}>
        <Button
          title="Manual"
          onPress={() => { stopAuto(); setMode('manual'); }}
          color={mode === 'manual' ? 'green' : 'gray'}
        />
        <Button
          title={autoCapturing ? 'Stop Auto' : 'Auto'}
          onPress={() => {
            if (mode !== 'auto') setMode('auto');
            autoCapturing ? stopAuto() : startAuto();
          }}
          color={mode === 'auto' ? (autoCapturing ? 'red' : 'green') : 'gray'}
        />
      </View>

      <View style={styles.info}>
        <Text style={styles.fieldArea}>Field Area: {area.toFixed(2)} ac / {(area*4046.86).toFixed(0)} m²</Text>
        <View style={styles.buttonRow}>
          <Button title="Add Point" onPress={async () => {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
            if (loc.coords.accuracy > 12) {
              Alert.alert('GPS Unstable', 'Wait for better signal before marking.');
              return;
            }
            addPoint({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }} />
          <View style={{ width: 12 }} />
          <Button title="Undo" onPress={undo} disabled={coords.length === 0} color="#f39c12" />
          <View style={{ width: 12 }} />
          <Button title="Reset" onPress={reset} color="#e74c3c" />
        </View>
        <View style={{ height: 12 }} />
        <Button title={saving ? "Saving..." : "Finish Boundary"} onPress={onFinish} color="#2980ff" disabled={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  map: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modeSwitch: {
    position: 'absolute', top: 40, left: 20, right: 20, flexDirection: 'row',
    justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 8, padding: 8,
    elevation: 4, zIndex: 10,
  },
  info: {
    position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: '#fff',
    padding: 18, borderRadius: 12, elevation: 6, alignItems: 'center',
  },
  fieldArea: { marginBottom: 10, fontSize: 17, fontWeight: '600', color: '#222' },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
});