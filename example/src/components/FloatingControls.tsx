import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
} from 'react-native';

interface FloatingControlsProps {
  currentScale: number;
  currentPage: number;
  totalPages: number;
  pageInput: string;
  minScale: number;
  maxScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onPageInputChange: (text: string) => void;
  onPageInputSubmit: () => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function FloatingControls({
  currentScale,
  currentPage,
  totalPages,
  pageInput,
  minScale,
  maxScale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onPageInputChange,
  onPageInputSubmit,
  onPreviousPage,
  onNextPage,
}: FloatingControlsProps) {
  return (
    <View style={styles.floatingControls}>
      {/* Page Navigation */}
      <View style={styles.pageControls}>
        <TouchableOpacity
          style={[
            styles.navButton,
            currentPage <= 1 && styles.navButtonDisabled,
          ]}
          onPress={onPreviousPage}
          disabled={currentPage <= 1}
        >
          <Text style={styles.navButtonText}>◀</Text>
        </TouchableOpacity>

        <View style={styles.pageInfoContainer}>
          <Text style={styles.pageLabel}>Page</Text>
          <View style={styles.pageInputWrapper}>
            <TextInput
              style={styles.pageInput}
              value={pageInput}
              onChangeText={onPageInputChange}
              onSubmitEditing={onPageInputSubmit}
              onBlur={onPageInputSubmit}
              keyboardType="number-pad"
              selectTextOnFocus
            />
            <Text style={styles.pageSeparator}>of</Text>
            <Text style={styles.pageTotal}>{totalPages}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.navButton,
            currentPage >= totalPages && styles.navButtonDisabled,
          ]}
          onPress={onNextPage}
          disabled={currentPage >= totalPages}
        >
          <Text style={styles.navButtonText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Zoom Controls */}
      <View style={styles.zoomControls}>
        <TouchableOpacity
          style={[
            styles.zoomButton,
            currentScale <= minScale && styles.zoomButtonDisabled,
          ]}
          onPress={onZoomOut}
          disabled={currentScale <= minScale}
        >
          <Text style={styles.zoomButtonText}>−</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.scaleDisplay} onPress={onResetZoom}>
          <Text style={styles.scaleLabel}>Zoom</Text>
          <Text style={styles.scaleText}>
            {Math.round(currentScale * 100)}%
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.zoomButton,
            currentScale >= maxScale && styles.zoomButtonDisabled,
          ]}
          onPress={onZoomIn}
          disabled={currentScale >= maxScale}
        >
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingControls: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
    gap: 16,
  },
  pageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 25, 0.98)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    gap: 8,
  },
  navButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.5)',
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(60, 60, 67, 0.5)',
    borderColor: 'rgba(60, 60, 67, 0.3)',
  },
  navButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pageInfoContainer: {
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  pageLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pageInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    minWidth: 40,
    textAlign: 'center',
    padding: 0,
  },
  pageSeparator: {
    fontSize: 14,
    color: '#636366',
    fontWeight: '500',
  },
  pageTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 25, 0.98)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    gap: 8,
  },
  zoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 159, 10, 0.9)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.5)',
    gap: 4,
  },
  zoomButtonDisabled: {
    backgroundColor: 'rgba(60, 60, 67, 0.5)',
    borderColor: 'rgba(60, 60, 67, 0.3)',
  },
  zoomButtonIcon: {
    fontSize: 12,
  },
  zoomButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  scaleDisplay: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  scaleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scaleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});
