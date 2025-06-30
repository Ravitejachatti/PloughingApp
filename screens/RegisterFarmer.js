import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwoOdpKTRjgYi_g_VbqOSOx0XUPf1FbjFKw-jptAF55SS_JdLkV36R13blnePhdX60LMA/exec';

export default function RegistrationScreen({ navigation }) {
  const [name, setName] = useState('');
  const [farmId, setFarmId] = useState('');
  const [phone, setPhone] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [cropType, setCropType] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [operatorPhone, setOperatorPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (
      !name.trim() || !farmId.trim() || !phone.trim() || !village.trim() ||
      !district.trim() || !state.trim() || !farmSize.trim() || !cropType.trim() ||
      !operatorName.trim() || !operatorPhone.trim()
    ) {
      Alert.alert('Validation', 'Please fill all fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          id: `M0${farmId}`,
          phone,
          village,
          district,
          state,
          farmSize,
          cropType,
          operatorName,
          operatorPhone
        }),
      });
      const data = await res.json();
      if (data.result === 'success') {
        navigation.replace('Boundary', {
          farmer: {
            name,
            id: `M0${farmId}`,
            phone,
            village,
            district,
            state,
            farmSize,
            cropType,
            operatorName,
            operatorPhone
          }
        });
      } else {
        Alert.alert('Error', 'Failed to register farmer.');
      }
    } catch (e) {
      console.error('Registration error:', e);
      Alert.alert('Error', 'Failed to connect to Google Sheets.');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f6fc' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 40}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Register Farmer</Text>
            <TextInput style={styles.input} placeholder="Farmer Name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Farm ID" value={farmId} onChangeText={setFarmId} />
            <TextInput style={styles.input} placeholder="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder="Village" value={village} onChangeText={setVillage} />
            <TextInput style={styles.input} placeholder="District" value={district} onChangeText={setDistrict} />
            <TextInput style={styles.input} placeholder="State" value={state} onChangeText={setState} />
            <TextInput style={styles.input} placeholder="Farm Size (acres)" value={farmSize} onChangeText={setFarmSize} keyboardType="numeric" />
            <TextInput style={styles.input} placeholder="Crop Type" value={cropType} onChangeText={setCropType} />
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionTitle}>Operator Details</Text>
            <TextInput style={styles.input} placeholder="Operator Name" value={operatorName} onChangeText={setOperatorName} />
            <TextInput style={styles.input} placeholder="Operator Phone Number" value={operatorPhone} onChangeText={setOperatorPhone} keyboardType="phone-pad" />
            <View style={{ height: 18 }} />
            <Button title={loading ? "Registering..." : "Next"} onPress={onSubmit} disabled={loading} color="#2980ff" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#2d3a4a', textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#c3d0e0',
    backgroundColor: '#f7fbff',
    padding: 14,
    marginBottom: 14,
    borderRadius: 8,
    fontSize: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#e0e6ef',
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#3a4d63',
  },
});