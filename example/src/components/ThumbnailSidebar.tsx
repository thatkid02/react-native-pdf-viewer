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
  onPagePress: (page: number) => void;
}

export function ThumbnailSidebar({
  visible,
  totalPages,
  currentPage,
  thumbnails,
  onPagePress,
}: ThumbnailSidebarProps) {
  if (!visible) return null;

  const renderThumbnail = (page: number) => {
    const thumbnailUri = thumbnails.get(page);
    const isCurrentPage = page + 1 === currentPage;

    return (
      <TouchableOpacity
        key={page}
        style={[
          styles.thumbnailItem,
          isCurrentPage && styles.thumbnailItemActive,
        ]}
        onPress={() => onPagePress(page + 1)}
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
    <View style={styles.thumbnailSidebar}>
      <ScrollView
        style={styles.thumbnailList}
        contentContainerStyle={styles.thumbnailListContent}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: totalPages }, (_, i) => renderThumbnail(i))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(28, 28, 30, 0.8)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  thumbnailItemActive: {
    transform: [{ scale: 1.05 }],
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
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 122, 255, 0.95)',
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
    color: '#0A84FF',
    fontWeight: '700',
  },
});
