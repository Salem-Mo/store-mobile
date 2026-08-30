import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f6fa' }}>
      <Text style={{ fontSize: 24, fontWeight: '900', color: '#14213d' }}>Hello Ayoub - Minimal Test</Text>
      <Text>if you see this, bundling works</Text>
    </View>
  );
}
