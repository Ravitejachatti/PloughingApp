import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, Button } from 'react-native';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwoOdpKTRjgYi_g_VbqOSOx0XUPf1FbjFKw-jptAF55SS_JdLkV36R13blnePhdX60LMA/exec';

export default function TestFarmersScreen({ navigation }) {
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchFarmers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL);
      if (!res.ok) {
        throw new Error('Network response was not ok');
      }
      console.log('Response status:', res.status);
      console.log('Response headers:', res);
      const data = await res.json();
      console.log('Fetched data:', data);
      if (!data.farmers || !Array.isArray(data.farmers) || data.farmers.length === 0) {
        setFarmers([]);
        setError('No farmer data found.');
      } else {
        setFarmers(data.farmers);
      }
    } catch (e) {
      setFarmers([]);
      setError('Failed to fetch data. Please check your connection or backend.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFarmers();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Registered Farmers</Text>
      <Button title="Refresh" onPress={fetchFarmers} />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={farmers}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.id}>ID: {item.id}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.error}>No farmer data found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  item: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  name: { fontSize: 18, fontWeight: '500' },
  id: { fontSize: 14, color: '#555' },
  error: { color: 'red', textAlign: 'center', marginTop: 20, fontSize: 16 },
});