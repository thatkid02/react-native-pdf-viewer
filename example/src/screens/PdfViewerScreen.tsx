import { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  StatusBar,
  TouchableOpacity,
  Text,
  Animated,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  PdfViewerView,
  callback,
  type LoadCompleteEvent,
  type PageChangeEvent,
  type ScaleChangeEvent,
  type ErrorEvent,
  type ThumbnailGeneratedEvent,
  type LoadingChangeEvent,
  type PdfViewerRef,
} from '@thatkid02/react-native-pdf-viewer';
import {
  ThumbnailSidebar,
  FloatingControls,
  LoadingOverlay,
} from '../components';
import type { RootStackParamList } from '../navigation/types';

type PdfViewerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PdfViewer'>;
  route: RouteProp<RootStackParamList, 'PdfViewer'>;
};

export default function PdfViewerScreen({
  navigation,
  route,
}: PdfViewerScreenProps) {
  const { pdfUrl, title } = route.params;
  const pdfRef = useRef<PdfViewerRef | null>(null);

  // Use route.key for React component key to force remount on navigation
  // but pass clean URL to native to allow proper caching
  const routeKey = route.key;

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentScale, setCurrentScale] = useState<number>(1.0);
  const [pageInput, setPageInput] = useState<string>('1');
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  const minScale = 0.5;
  const maxScale = 5.0;
  const zoomStep = 0.5;

  const toggleControls = useCallback(() => {
    const toValue = controlsVisible ? 0 : 1;
    setControlsVisible(!controlsVisible);
    Animated.timing(controlsOpacity, {
      toValue,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [controlsVisible, controlsOpacity]);

  const handleLoadComplete = useCallback((event: LoadCompleteEvent) => {
    setTotalPages(event.pageCount);
    setCurrentPage(1);
    setPageInput('1');
    setCurrentScale(1.0);

    // Auto-generate thumbnails for first few pages
    if (event.pageCount > 0) {
      setTimeout(() => {
        const pagesToGenerate = Math.min(10, event.pageCount);
        for (let i = 0; i < pagesToGenerate; i++) {
          try {
            pdfRef.current?.generateThumbnail(i);
          } catch {
            // Silently fail if thumbnail generation errors
          }
        }
      }, 500);
    }
  }, []);

  const handlePageChange = useCallback((event: PageChangeEvent) => {
    setCurrentPage(event.page + 1);
    setPageInput((event.page + 1).toString());
  }, []);

  const handleScaleChange = useCallback((event: ScaleChangeEvent) => {
    setCurrentScale(event.scale);
  }, []);

  const handleError = useCallback((event: ErrorEvent) => {
    Alert.alert('Error', event.message);
  }, []);

  const handleThumbnailGenerated = useCallback(
    (event: ThumbnailGeneratedEvent) => {
      setThumbnails((prev) => new Map(prev).set(event.page, event.uri));
    },
    []
  );

  const handleLoadingChange = useCallback((event: LoadingChangeEvent) => {
    setIsLoading(event.isLoading);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        try {
          pdfRef.current?.goToPage(page - 1);
          setPageInput(page.toString());
        } catch (error) {
          console.warn('Error navigating to page:', error);
        }
      }
    },
    [totalPages]
  );

  const handlePageInputSubmit = useCallback(() => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page)) {
      goToPage(page);
    } else {
      setPageInput(currentPage.toString());
    }
  }, [pageInput, currentPage, goToPage]);

  const zoomIn = useCallback(() => {
    const newScale = Math.min(currentScale + zoomStep, maxScale);
    try {
      pdfRef.current?.setScale(newScale);
    } catch (error) {
      console.warn('Error zooming in:', error);
    }
  }, [currentScale, maxScale]);

  const zoomOut = useCallback(() => {
    const newScale = Math.max(currentScale - zoomStep, minScale);
    try {
      pdfRef.current?.setScale(newScale);
    } catch (error) {
      console.warn('Error zooming out:', error);
    }
  }, [currentScale, minScale]);

  const resetZoom = useCallback(() => {
    try {
      pdfRef.current?.setScale(1.0);
    } catch (error) {
      console.warn('Error resetting zoom:', error);
    }
  }, []);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, totalPages, goToPage]);

  const handleThumbnailPress = useCallback(
    (page: number) => {
      goToPage(page + 1);
      setShowThumbnails(false);
    },
    [goToPage]
  );

  // Cleanup on unmount and query document info on mount (for cached PDFs)
  useEffect(() => {
    // Query document info after mount to handle cached PDFs
    // When PDF loads from cache, onLoadComplete might fire before React is ready
    setTimeout(() => {
      try {
        const info = pdfRef.current?.getDocumentInfo();
        if (info && info.pageCount > 0 && totalPages === 0) {
          setTotalPages(info.pageCount);
          const restoredPage = info.currentPage + 1; // Convert 0-indexed to 1-indexed
          setCurrentPage(restoredPage);
          setPageInput(restoredPage.toString());
          setCurrentScale(1.0);

          // Generate thumbnails
          const pagesToGenerate = Math.min(10, info.pageCount);
          for (let i = 0; i < pagesToGenerate; i++) {
            pdfRef.current?.generateThumbnail(i);
          }
        }
      } catch (error) {
        console.log('⚠️ Error querying document info:', error);
      }
    }, 100);

    return () => {
      // Cleanup
    };
  }, [routeKey, pdfUrl, totalPages, thumbnails.size]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: controlsOpacity }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.headerTitleText} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle}>
            Page {currentPage} of {totalPages}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowThumbnails(!showThumbnails)}
        >
          <Text style={styles.menuButtonText}>☰</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* PDF Viewer */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={toggleControls}
        style={styles.pdfContainer}
      >
        <PdfViewerView
          key={pdfUrl}
          hybridRef={callback((ref: PdfViewerRef | null) => {
            pdfRef.current = ref;
          })}
          source={pdfUrl}
          style={styles.pdfViewer}
          enableZoom={true}
          minScale={minScale}
          maxScale={maxScale}
          spacing={10}
          showsActivityIndicator={true}
          onLoadComplete={callback(handleLoadComplete)}
          onPageChange={callback(handlePageChange)}
          onScaleChange={callback(handleScaleChange)}
          onError={callback(handleError)}
          onThumbnailGenerated={callback(handleThumbnailGenerated)}
          onLoadingChange={callback(handleLoadingChange)}
          contentInsetTop={200}
        />
      </TouchableOpacity>

      {/* Loading Overlay */}
      <LoadingOverlay visible={isLoading} />

      {/* Floating Controls */}
      <Animated.View style={{ opacity: controlsOpacity }}>
        <FloatingControls
          currentScale={currentScale}
          currentPage={currentPage}
          totalPages={totalPages}
          pageInput={pageInput}
          minScale={minScale}
          maxScale={maxScale}
          onPageInputChange={setPageInput}
          onPageInputSubmit={handlePageInputSubmit}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          onPrevPage={goToPrevPage}
          onNextPage={goToNextPage}
        />
      </Animated.View>

      {/* Thumbnail Sidebar */}
      <ThumbnailSidebar
        visible={showThumbnails}
        thumbnails={thumbnails}
        currentPage={currentPage - 1}
        totalPages={totalPages}
        onThumbnailPress={handleThumbnailPress}
        onClose={() => setShowThumbnails(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 16,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '600',
  },
  pdfContainer: {
    flex: 1,
  },
  pdfViewer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
});
