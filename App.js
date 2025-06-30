// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import RegistrationScreen from './screens/RegisterFarmer';
import BoundaryScreen from './screens/BoundaryCaptureScreen';
import PloughingScreen from './screens/PloughingSession';


const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
    
      {/* <Stack.Navigator initialRouteName="Registration" screenOptions={{ headerShown: false }}> *  /}
      {/* Uncomment the above line to hide the header completely */}
       <Stack.Navigator initialRouteName="Registration" screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="Registration"
          component={RegistrationScreen}
          options={{ title: 'Farmer Registration' }}
        />
        <Stack.Screen
          name="Boundary"
          component={BoundaryScreen}
          options={{ title: 'Boundary Capture' }}
        />
        <Stack.Screen
          name="Plough"
          component={PloughingScreen}
          options={{ title: 'Ploughing Tracker' }}
        />
        <Stack.Screen
          name="Testing"
          component={require('./screens/testing').default}
          options={{ title: 'Testing' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
