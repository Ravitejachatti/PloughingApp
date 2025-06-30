import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform, 
  SafeAreaView,
  Animated,
  Dimensions
} from 'react-native';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwoOdpKTRjgYi_g_VbqOSOx0XUPf1FbjFKw-jptAF55SS_JdLkV36R13blnePhdX60LMA/exec';

const { width } = Dimensions.get('window');

export default function RegistrationScreen({ navigation }) {
  const [formData, setFormData] = useState({
    name: '',
    farmId: '',
    phone: '',
    village: '',
    district: '',
    state: '',
    farmSize: '',
    cropType: '',
    operatorName: '',
    operatorPhone: ''
  });
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [progress] = useState(new Animated.Value(0));

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Update progress animation
    const filledFields = Object.values({ ...formData, [field]: value }).filter(val => val.trim()).length;
    const progressValue = filledFields / 10;
    Animated.timing(progress, {
      toValue: progressValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const onSubmit = async () => {
    const requiredFields = Object.values(formData);
    if (requiredFields.some(field => !field.trim())) {
      Alert.alert('Incomplete Form', 'Please fill all fields to continue.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id: `M0${formData.farmId}`,
        }),
      });
      const data = await res.json();
      if (data.result === 'success') {
        navigation.replace('Boundary', {
          farmer: {
            ...formData,
            id: `M0${formData.farmId}`,
          }
        });
      } else {
        Alert.alert('Registration Failed', 'Unable to register farmer. Please try again.');
      }
    } catch (e) {
      console.error('Registration error:', e);
      Alert.alert('Connection Error', 'Please check your internet connection and try again.');
    }
    setLoading(false);
  };

  const InputField = ({ 
    placeholder, 
    value, 
    onChangeText, 
    keyboardType = 'default',
    icon,
    field
  }) => (
    <View style={[
      styles.inputContainer,
      focusedField === field && styles.inputContainerFocused
    ]}>
      <Text style={styles.inputLabel}>{placeholder}</Text>
      <TextInput
        style={[
          styles.input,
          focusedField === field && styles.inputFocused
        ]}
        placeholder={`Enter ${placeholder.toLowerCase()}`}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        onFocus={() => setFocusedField(field)}
        onBlur={() => setFocusedField(null)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Farmer Registration</Text>
            <Text style={styles.subtitle}>Complete your profile to get started</Text>
            
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View 
                  style={[
                    styles.progressBar,
                    {
                      width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {Object.values(formData).filter(val => val.trim()).length}/10 fields completed
              </Text>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            {/* Farmer Information Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👨‍🌾 Farmer Information</Text>
              
              <InputField
                placeholder="Farmer Name"
                value={formData.name}
                onChangeText={(value) => updateField('name', value)}
                field="name"
              />
              
              <InputField
                placeholder="Farm ID"
                value={formData.farmId}
                onChangeText={(value) => updateField('farmId', value)}
                field="farmId"
              />
              
              <InputField
                placeholder="Phone Number"
                value={formData.phone}
                onChangeText={(value) => updateField('phone', value)}
                keyboardType="phone-pad"
                field="phone"
              />
            </View>

            {/* Location Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📍 Location Details</Text>
              
              <InputField
                placeholder="Village"
                value={formData.village}
                onChangeText={(value) => updateField('village', value)}
                field="village"
              />
              
              <InputField
                placeholder="District"
                value={formData.district}
                onChangeText={(value) => updateField('district', value)}
                field="district"
              />
              
              <InputField
                placeholder="State"
                value={formData.state}
                onChangeText={(value) => updateField('state', value)}
                field="state"
              />
            </View>

            {/* Farm Details Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🌾 Farm Details</Text>
              
              <InputField
                placeholder="Farm Size (acres)"
                value={formData.farmSize}
                onChangeText={(value) => updateField('farmSize', value)}
                keyboardType="numeric"
                field="farmSize"
              />
              
              <InputField
                placeholder="Crop Type"
                value={formData.cropType}
                onChangeText={(value) => updateField('cropType', value)}
                field="cropType"
              />
            </View>

            {/* Operator Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🚜 Operator Details</Text>
              
              <InputField
                placeholder="Operator Name"
                value={formData.operatorName}
                onChangeText={(value) => updateField('operatorName', value)}
                field="operatorName"
              />
              
              <InputField
                placeholder="Operator Phone"
                value={formData.operatorPhone}
                onChangeText={(value) => updateField('operatorPhone', value)}
                keyboardType="phone-pad"
                field="operatorPhone"
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                loading && styles.submitButtonDisabled
              ]}
              onPress={onSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Registering...' : 'Continue to Boundary Mapping'}
              </Text>
              {!loading && <Text style={styles.submitButtonIcon}>→</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 20,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#F3F4F6',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputContainerFocused: {
    transform: [{ scale: 1.02 }],
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    transition: 'all 0.2s ease',
  },
  inputFocused: {
    borderColor: '#10B981',
    backgroundColor: '#FFFFFF',
    shadowColor: '#10B981',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  submitButtonIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
});