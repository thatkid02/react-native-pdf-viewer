import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';

const THUMBNAIL_WIDTH = 80;
const THUMBNAIL_HEIGHT = 110;

interface ThumbnailSidebarProps {
  visible: boolean;
  totalPages: number;
  currentPage: number;
  thumbnails: Map<number, string>;
  onThumbnailPress: (page: number) => void;
  onClose: () => void;
}

export function ThumbnailSidebar({
  visible,
  totalPages,
  currentPage,
  thumbnails,
  onThumbnailPress,
  onClose,
}: ThumbnailSidebarProps) {
  if (!visible) return null;

  const renderThumbnail = (page: number) => {
    const thumbnailUri = thumbnails.get(page);
    const isCurrentPage = page === currentPage;

    return (
      <TouchableOpacity
        key={page}
        style={[
          styles.thumbnailItem,
          isCurrentPage && styles.thumbnailItemActive,
        ]}
        onPress={() => onThumbnailPress(page)}
      >
        <View style={styles.thumbnailCard}>
          {thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={styles.thumbnailImage}
            />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Text style={styles.thumbnailPlaceholderIcon}>📄</Text>
              <Text style={styles.thumbnailPlaceholderText}>{page + 1}</Text>
            </View>
          )}
          {isCurrentPage && (
            <View style={styles.currentBadge}>
              <View style={styles.currentDot} />
            </View>
          )}
        </View>
        <Text
          style={[
            styles.thumbnailPageNumber,
            isCurrentPage && styles.thumbnailPageNumberActive,
          ]}
        >
          {page + 1}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pages</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: totalPages }, (_, i) => renderThumbnail(i))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  thumbnailSidebar: {
    position: 'absolute',
    top: 150, // Account for status bar + header
    left: 20,
    bottom: 320, // Above toolbar with safe area
    width: THUMBNAIL_WIDTH + 20,
    backgroundColor: 'rgba(20, 20, 25, 0.98)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 5,
  },
  thumbnailList: {
    flex: 1,
  },
  thumbnailListContent: {
    padding: 10,
    gap: 8,
    paddingBottom: 20, // Extra padding at bottom
  },
  thumbnailItem: {
    alignItems: 'center',
    gap: 4,
  },
  thumbnailCard: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 28, 30, 0.8)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  thumbnailItemActive: {
    borderColor: '#6366f1',
  },
  thumbnailImage: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    gap: 4,
  },
  thumbnailPlaceholderIcon: {
    fontSize: 24,
    opacity: 0.3,
  },
  thumbnailPlaceholderText: {
    fontSize: 11,
    color: '#636366',
    fontWeight: '500',
  },
  currentBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  currentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  thumbnailPageNumber: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  thumbnailPageNumberActive: {
    color: '#6366f1',
    fontWeight: '700',
  },
});
