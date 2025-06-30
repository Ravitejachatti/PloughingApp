import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator, 
  Animated,
  Dimensions,
  SafeAreaView
} from 'react-native';
import MapView, { Polygon, Marker } from 'react-native-maps';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function BoundaryScreen({ route, navigation }) {
  const { farmer } = route.params;
  const mapRef = useRef(null);
  const locationSub = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [region, setRegion] = useState(null);
  const [coords, setCoords] = useState([]);
  const [area, setArea] = useState(0);
  const [mode, setMode] = useState('manual');
  const [autoCapturing, setAutoCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // Pulse animation for auto capture
  useEffect(() => {
    if (autoCapturing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [autoCapturing]);

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
        Alert.alert('Permission Required', 'Location access is essential for boundary mapping.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002,
      });
      setGpsAccuracy(loc.coords.accuracy);
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
        Alert.alert('Invalid Shape', 'Boundary lines are crossing. Please adjust your boundary.');
        setArea(0);
        return;
      }
      const sqm = turf.area(polygon);
      setArea(sqm / 4046.8564224); // acres
      AsyncStorage.setItem('lastBoundary', JSON.stringify({ coords, area: sqm / 4046.8564224 }));
    } else {
      setArea(0);
    }
  }, [coords]);

  const addPoint = (pt) => {
    setCoords(prev => [...prev, pt]);
  };

  const onMapPress = ({ nativeEvent: { coordinate } }) => {
    if (mode === 'manual') addPoint(coordinate);
  };

  const prevHeadingRef = useRef(null);
  const startAuto = async () => {
    if (autoCapturing) return;
    setAutoCapturing(true);
    prevHeadingRef.current = null;
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 800, distanceInterval: 0.4 },
      loc => {
        if (!loc?.coords) return;
        setGpsAccuracy(loc.coords.accuracy);
        if (loc.coords.accuracy > 12) return;
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

  const undo = () => setCoords(c => c.slice(0, -1));
  const reset = () => { 
    setCoords([]); 
    setArea(0); 
    AsyncStorage.removeItem('lastBoundary'); 
  };

  const onFinish = async () => {
    if (coords.length < 3 || area === 0) {
      Alert.alert('Incomplete Boundary', 'Please mark at least 3 points to define your field boundary.');
      return;
    }
    setSaving(true);
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

  const ModeButton = ({ title, isActive, onPress, icon }) => (
    <TouchableOpacity
      style={[styles.modeButton, isActive && styles.modeButtonActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.modeButtonIcon}>{icon}</Text>
      <Text style={[styles.modeButtonText, isActive && styles.modeButtonTextActive]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const ActionButton = ({ title, onPress, disabled, color = '#10B981', icon }) => (
    <TouchableOpacity
      style={[
        styles.actionButton,
        { backgroundColor: disabled ? '#9CA3AF' : color },
        disabled && styles.actionButtonDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={styles.actionButtonIcon}>{icon}</Text>
      <Text style={styles.actionButtonText}>{title}</Text>
    </TouchableOpacity>
  );

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Acquiring GPS location...</Text>
        <Text style={styles.loadingSubtext}>Please ensure location services are enabled</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        region={region}
        ref={mapRef}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={onMapPress}
        mapType="satellite"
      >
        {coords.length >= 2 && (
          <Polygon
            coordinates={coords}
            strokeColor="#10B981"
            fillColor="rgba(16, 185, 129, 0.2)"
            strokeWidth={3}
          />
        )}
        {coords.length > 0 && (
          <Marker 
            coordinate={coords[0]} 
            pinColor="#F59E0B" 
            title="Start Point"
            description="First boundary point"
          />
        )}
        {coords.map((pt, i) => (
          <Marker 
            key={i} 
            coordinate={pt} 
            pinColor="#10B981"
            title={`Point ${i + 1}`}
          />
        ))}
      </MapView>

      {/* Header Card */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Field Boundary Mapping</Text>
        <Text style={styles.headerSubtitle}>Farmer: {farmer.name}</Text>
        {gpsAccuracy && (
          <View style={styles.gpsIndicator}>
            <View style={[
              styles.gpsStatus,
              { backgroundColor: gpsAccuracy < 5 ? '#10B981' : gpsAccuracy < 10 ? '#F59E0B' : '#EF4444' }
            ]} />
            <Text style={styles.gpsText}>
              GPS: {gpsAccuracy < 5 ? 'Excellent' : gpsAccuracy < 10 ? 'Good' : 'Poor'} ({gpsAccuracy.toFixed(1)}m)
            </Text>
          </View>
        )}
      </View>

      {/* Mode Selection */}
      <View style={styles.modeContainer}>
        <ModeButton
          title="Manual"
          icon="👆"
          isActive={mode === 'manual'}
          onPress={() => { stopAuto(); setMode('manual'); }}
        />
        <Animated.View style={{ transform: [{ scale: autoCapturing ? pulseAnim : 1 }] }}>
          <ModeButton
            title={autoCapturing ? 'Stop Auto' : 'Auto Walk'}
            icon={autoCapturing ? '⏹️' : '🚶'}
            isActive={mode === 'auto'}
            onPress={() => {
              if (mode !== 'auto') setMode('auto');
              autoCapturing ? stopAuto() : startAuto();
            }}
          />
        </Animated.View>
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <View style={styles.areaDisplay}>
          <Text style={styles.areaLabel}>Field Area</Text>
          <Text style={styles.areaValue}>{area.toFixed(2)} acres</Text>
          <Text style={styles.areaSubValue}>{(area * 4046.86).toFixed(0)} m²</Text>
        </View>

        <View style={styles.pointsDisplay}>
          <Text style={styles.pointsLabel}>Boundary Points</Text>
          <Text style={styles.pointsValue}>{coords.length}</Text>
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            title="Add Point"
            icon="📍"
            onPress={async () => {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
              if (loc.coords.accuracy > 12) {
                Alert.alert('GPS Signal Weak', 'Please wait for better GPS signal before adding point.');
                return;
              }
              addPoint({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            }}
          />
          
          <ActionButton
            title="Undo"
            icon="↶"
            onPress={undo}
            disabled={coords.length === 0}
            color="#F59E0B"
          />
          
          <ActionButton
            title="Reset"
            icon="🗑️"
            onPress={reset}
            color="#EF4444"
          />
        </View>

        <TouchableOpacity
          style={[styles.finishButton, saving && styles.finishButtonDisabled]}
          onPress={onFinish}
          disabled={saving || coords.length < 3}
          activeOpacity={0.8}
        >
          <Text style={styles.finishButtonText}>
            {saving ? 'Saving Boundary...' : 'Complete Boundary Mapping'}
          </Text>
          {!saving && <Text style={styles.finishButtonIcon}>✓</Text>}
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  headerCard: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gpsStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  gpsText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  modeContainer: {
    position: 'absolute',
    top: 160,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    flex: 0.48,
  },
  modeButtonActive: {
    backgroundColor: '#10B981',
  },
  modeButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  infoPanel: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  areaDisplay: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  areaLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  areaValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10B981',
    marginVertical: 4,
  },
  areaSubValue: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  pointsDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pointsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  pointsValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10B981',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    flex: 0.3,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  actionButtonIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  finishButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  finishButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  finishButtonIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});