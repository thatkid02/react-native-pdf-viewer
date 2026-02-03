import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { ProgressiveBlurView } from 'react-native-progressive-blur';

interface HeaderProps {
  isLoading: boolean;
  onSourcePress: () => void;
}

export function Header({ isLoading, onSourcePress }: HeaderProps) {
  return (
    <View style={styles.header} pointerEvents="box-none">
      {Platform.OS === 'ios' && (
        <ProgressiveBlurView
          style={StyleSheet.absoluteFill}
          direction="topToBottom"
          intensity={12}
          tint="dark"
          locations={[0.3, 0.95]}
        />
      )}
      {Platform.OS === 'android' && (
        <View style={[StyleSheet.absoluteFill, styles.androidGradient]} />
      )}
      <View style={styles.headerContent}>
        <View style={styles.titleContainer}>
          <View style={styles.titleWrapper}>
            <Text style={styles.icon}>📑</Text>
            <View>
              <Text style={styles.title}>PDF Viewer</Text>
              <Text style={styles.subtitle}>Professional Edition</Text>
            </View>
          </View>
          {isLoading && (
            <View style={styles.loadingBadge}>
              <View style={styles.loadingDot} />
              <Text style={styles.loadingText}>Loading</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.sourceButton} onPress={onSourcePress}>
          <Text style={styles.sourceIcon}>📂</Text>
          <Text style={styles.sourceButtonText}>Change Source</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    zIndex: 10,
  },
  androidGradient: {
    backgroundColor: 'rgba(0, 0, 0, 0.21)',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 55,
  },
  titleContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8E8E93',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: -2,
  },
  loadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
    gap: 6,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34C759',
  },
  loadingText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '600',
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  sourceIcon: {
    fontSize: 16,
  },
  sourceButtonText: {
    color: '#000000',
    fontWeight: '600',
    fontSize: 14,
  },
});
