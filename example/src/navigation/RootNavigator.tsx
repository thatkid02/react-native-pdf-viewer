import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_bottom',
        presentation: 'fullScreenModal',
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          animation: 'none',
        }}
      />
      <Stack.Screen
        name="PdfViewer"
        component={PdfViewerScreen}
        options={{
          animation: 'none',
          presentation: 'card',
        }}
      />
    </Stack.Navigator>
  );
}
