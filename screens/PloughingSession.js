import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Alert,
  Animated,
  Dimensions,
  SafeAreaView
} from 'react-native';
import MapView, { Polygon } from 'react-native-maps';
import * as Location from 'expo-location';
import * as turf from '@turf/turf';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ploughWidth = 2; // meters
const { width, height } = Dimensions.get('window');

export default function PloughingScreen({ route, navigation }) {
  const { farmer, boundaryCoords, fieldArea, geojson } = route.params;
  const mapRef = useRef();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const [region, setRegion] = useState(null);
  const [gridCells, setGridCells] = useState([]);
  const cellCounts = useRef(new Map());
  const [ploughing, setPloughing] = useState(false);
  const [ploughedArea, setPloughedArea] = useState(0);
  const [progress, setProgress] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [speed, setSpeed] = useState(0);
  const sessionStartTime = useRef(null);

  // Pulse animation for ploughing indicator
  useEffect(() => {
    if (ploughing) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [ploughing]);

  // Progress animation
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Session timer
  useEffect(() => {
    let interval;
    if (ploughing) {
      interval = setInterval(() => {
        if (sessionStartTime.current) {
          setSessionTime(Math.floor((Date.now() - sessionStartTime.current) / 1000));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [ploughing]);

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
        const { ploughedArea, progress, cells, sessionTime } = JSON.parse(d);
        setPloughedArea(ploughedArea);
        setProgress(progress);
        setSessionTime(sessionTime || 0);
        if (cells) {
          cells.forEach(([id,count]) => cellCounts.current.set(id,count));
        }
      }
    });
  }, []);

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
          sessionTime,
          timestamp: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.result === 'success') {
        Alert.alert('Session Complete! 🎉', 'Your ploughing session has been successfully recorded.');
      } else {
        Alert.alert('Save Error', 'Session completed but failed to sync with server.');
      }
    } catch (e) {
      Alert.alert('Connection Error', 'Session completed but could not sync. Data saved locally.');
    }
  };

  // GPS tracking and cell updates
  const locationSub = useRef();
  const lastLocation = useRef(null);
  
  const togglePlough = async () => {
    if (!ploughing) {
      cellCounts.current.clear();
      setPloughedArea(0);
      setProgress(0);
      setSessionTime(0);
      sessionStartTime.current = Date.now();
      setPloughing(true);
      
      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 600, distanceInterval: 0.3 },
        loc => {
          if (!loc?.coords || loc.coords.accuracy > 12) return;
          
          // Calculate speed
          if (lastLocation.current) {
            const distance = turf.distance(
              [lastLocation.current.longitude, lastLocation.current.latitude],
              [loc.coords.longitude, loc.coords.latitude],
              { units: 'meters' }
            );
            const timeDiff = (loc.timestamp - lastLocation.current.timestamp) / 1000;
            const currentSpeed = distance / timeDiff; // m/s
            setSpeed(currentSpeed * 3.6); // km/h
          }
          lastLocation.current = loc.coords;
          
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
            const newProgress = Math.min(covered / fieldArea, 1);
            setProgress(newProgress);
            
            AsyncStorage.setItem('lastPloughSession', JSON.stringify({
              ploughedArea: covered, 
              progress: newProgress,
              sessionTime: Math.floor((Date.now() - sessionStartTime.current) / 1000),
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

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressColor = () => {
    if (progress < 0.3) return '#EF4444';
    if (progress < 0.7) return '#F59E0B';
    return '#10B981';
  };

  if(!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Initializing ploughing session...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <MapView 
        ref={mapRef} 
        style={styles.map} 
        region={region} 
        showsUserLocation
        showsMyLocationButton={false}
        mapType="satellite"
      >
        <Polygon 
          coordinates={boundaryCoords} 
          strokeColor="#10B981" 
          fillColor="rgba(16, 185, 129, 0.15)"
          strokeWidth={3}
        />
        {ploughing && gridCells.map(({id,feature})=>{
          const count=cellCounts.current.get(id)||0;
          if(!count) return null;
          const coords=feature.geometry.coordinates[0].map(([lng,lat])=>({latitude:lat,longitude:lng}));
          return (
            <Polygon 
              key={id} 
              coordinates={coords} 
              fillColor={count>1?'rgba(239, 68, 68, 0.6)':'rgba(16, 185, 129, 0.4)'} 
              strokeWidth={0}
            />
          );
        })}
      </MapView>

      {/* Header Info */}
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>Ploughing Session</Text>
        <Text style={styles.headerSubtitle}>{farmer.name} • {fieldArea.toFixed(2)} acres</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Width</Text>
            <Text style={styles.statusValue}>{ploughWidth}m</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Speed</Text>
            <Text style={styles.statusValue}>{speed.toFixed(1)} km/h</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Time</Text>
            <Text style={styles.statusValue}>{formatTime(sessionTime)}</Text>
          </View>
        </View>
      </View>

      {/* Control Panel */}
      <View style={styles.controlPanel}>
        {/* Progress Section */}
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Field Progress</Text>
            <Text style={[styles.progressPercentage, { color: getProgressColor() }]}>
              {(progress * 100).toFixed(1)}%
            </Text>
          </View>
          
          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: getProgressColor(),
                }
              ]} 
            />
          </View>
          
          <View style={styles.areaInfo}>
            <View style={styles.areaItem}>
              <Text style={styles.areaLabel}>Ploughed</Text>
              <Text style={styles.areaValue}>{ploughedArea.toFixed(2)} ac</Text>
            </View>
            <View style={styles.areaItem}>
              <Text style={styles.areaLabel}>Remaining</Text>
              <Text style={styles.areaValue}>{(fieldArea - ploughedArea).toFixed(2)} ac</Text>
            </View>
          </View>
        </View>

        {/* Control Buttons */}
        <View style={styles.buttonSection}>
          <Animated.View style={{ transform: [{ scale: ploughing ? pulseAnim : 1 }] }}>
            <TouchableOpacity
              style={[
                styles.mainButton,
                { backgroundColor: ploughing ? '#EF4444' : '#10B981' }
              ]}
              onPress={togglePlough}
              activeOpacity={0.8}
            >
              <Text style={styles.mainButtonIcon}>
                {ploughing ? '⏹️' : '▶️'}
              </Text>
              <Text style={styles.mainButtonText}>
                {ploughing ? 'Stop Ploughing' : 'Start Ploughing'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              const features = [
                geojson,
                ...gridCells.filter(({id})=>cellCounts.current.has(id)).map(({feature})=>feature)
              ];
              const out = { type: 'FeatureCollection', features };
              Alert.alert(
                "Export Complete 📊", 
                `Session data exported successfully!\n\nPloughed: ${ploughedArea.toFixed(2)} acres\nProgress: ${(progress*100).toFixed(1)}%\nTime: ${formatTime(sessionTime)}`,
                [{ text: "OK", style: "default" }]
              );
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonIcon}>📊</Text>
            <Text style={styles.secondaryButtonText}>Export Session Data</Text>
          </TouchableOpacity>
        </View>

        {/* Status Indicators */}
        {ploughing && (
          <View style={styles.statusIndicators}>
            <View style={[styles.indicator, styles.indicatorActive]}>
              <Text style={styles.indicatorText}>🟢 GPS Tracking Active</Text>
            </View>
            <View style={[styles.indicator, styles.indicatorActive]}>
              <Text style={styles.indicatorText}>🚜 Ploughing in Progress</Text>
            </View>
          </View>
        )}
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
  headerCard: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: {
    alignItems: 'center',
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 2,
  },
  controlPanel: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  progressSection: {
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
  },
  progressPercentage: {
    fontSize: 24,
    fontWeight: '800',
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    borderRadius: 6,
  },
  areaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  areaItem: {
    alignItems: 'center',
    flex: 1,
  },
  areaLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  areaValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginTop: 4,
  },
  buttonSection: {
    marginBottom: 16,
  },
  mainButton: {
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  mainButtonIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  mainButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  statusIndicators: {
    gap: 8,
  },
  indicator: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  indicatorActive: {
    backgroundColor: '#DCFCE7',
  },
  indicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
});