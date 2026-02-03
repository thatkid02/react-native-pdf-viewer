import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';

interface ToolbarProps {
  showThumbnails: boolean;
  horizontal: boolean;
  enablePaging: boolean;
  spacing: number;
  onToggleThumbnails: () => void;
  onToggleHorizontal: () => void;
  onTogglePaging: () => void;
  onToggleSpacing: () => void;
  onGenerateAll: () => void;
}

export function Toolbar({
  showThumbnails,
  horizontal,
  enablePaging,
  spacing,
  onToggleThumbnails,
  onToggleHorizontal,
  onTogglePaging,
  onToggleSpacing,
  onGenerateAll,
}: ToolbarProps) {
  return (
    <View style={styles.toolbar}>
      <View style={styles.toolbarContent}>
        <TouchableOpacity
          style={[
            styles.toolbarButton,
            showThumbnails && styles.toolbarButtonActive,
          ]}
          onPress={onToggleThumbnails}
        >
          <Text style={styles.toolbarButtonIcon}>
            {showThumbnails ? '📑' : '📑'}
          </Text>
          <Text
            style={[
              styles.toolbarButtonText,
              showThumbnails && styles.toolbarButtonTextActive,
            ]}
          >
            {showThumbnails ? 'Hide' : 'Pages'}
          </Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <>
            <View style={styles.separator} />
            <TouchableOpacity
              style={[
                styles.toolbarButton,
                horizontal && styles.toolbarButtonActive,
              ]}
              onPress={onToggleHorizontal}
            >
              <Text style={styles.toolbarButtonIcon}>
                {horizontal ? '↔️' : '↕️'}
              </Text>
              <Text
                style={[
                  styles.toolbarButtonText,
                  horizontal && styles.toolbarButtonTextActive,
                ]}
              >
                {horizontal ? 'Horizontal' : 'Vertical'}
              </Text>
            </TouchableOpacity>

            <View style={styles.separator} />
            <TouchableOpacity
              style={[
                styles.toolbarButton,
                enablePaging && styles.toolbarButtonActive,
              ]}
              onPress={onTogglePaging}
            >
              <Text style={styles.toolbarButtonIcon}>
                {enablePaging ? '📄' : '📜'}
              </Text>
              <Text
                style={[
                  styles.toolbarButtonText,
                  enablePaging && styles.toolbarButtonTextActive,
                ]}
              >
                {!enablePaging ? 'Paging' : 'Scroll'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.separator} />
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={onToggleSpacing}
        >
          <Text style={styles.toolbarButtonIcon}>📏</Text>
          <Text style={styles.toolbarButtonText}>{spacing}px</Text>
        </TouchableOpacity>

        <View style={styles.separator} />
        <TouchableOpacity style={styles.toolbarButton} onPress={onGenerateAll}>
          <Text style={styles.toolbarButtonIcon}>⚡️</Text>
          <Text style={styles.toolbarButtonText}>Generate</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    backgroundColor: 'rgba(10, 10, 15, 0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(48, 48, 52, 0.8)',
    borderRadius: 14,
    padding: 6,
  },
  toolbarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  toolbarButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
  },
  toolbarButtonIcon: {
    fontSize: 16,
  },
  toolbarButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  toolbarButtonTextActive: {
    color: '#0A84FF',
  },
  separator: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
