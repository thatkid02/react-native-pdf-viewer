import { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
} from 'react-native';
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
  Header,
  ThumbnailSidebar,
  FloatingControls,
  Toolbar,
  SourceModal,
  LoadingOverlay,
} from './components';

export default function App() {
  const pdfRef = useRef<PdfViewerRef | null>(null);
  const [pdfSource, setPdfSource] = useState<string>(
    'https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf'
  );

  console.log('App rendering with pdfSource:', pdfSource);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentScale, setCurrentScale] = useState<number>(1.0);
  const [pageInput, setPageInput] = useState<string>('1');
  const [horizontal, setHorizontal] = useState<boolean>(false);
  const [enablePaging, setEnablePaging] = useState<boolean>(true);
  const [spacing, setSpacing] = useState<number>(10);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(true);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [showSourceModal, setShowSourceModal] = useState<boolean>(false);
  const [tempSource, setTempSource] = useState<string>(pdfSource);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Glass UI dimensions for content insets
  const HEADER_HEIGHT = 100; // From styles.header
  const TOOLBAR_HEIGHT = 60; // Approximate toolbar height (paddingVertical: 12, button height ~38)

  const minScale = 0.5;
  const maxScale = 5.0;
  const zoomStep = 0.5;

  const handleLoadComplete = (event: LoadCompleteEvent) => {
    console.log('PDF loaded:', event);
    console.log('handleLoadComplete called, pageCount:', event.pageCount);

    setTotalPages(event.pageCount);
    setCurrentPage(1);
    setPageInput('1');
    setCurrentScale(1.0);

    // Auto-generate thumbnails for first few pages after a short delay
    if (event.pageCount > 0) {
      console.log(
        `Generating thumbnails for ${Math.min(10, event.pageCount)} pages`
      );
      setTimeout(() => {
        const pagesToGenerate = Math.min(10, event.pageCount); // Generate more thumbnails
        for (let i = 0; i < pagesToGenerate; i++) {
          try {
            if (pdfRef.current?.generateThumbnail) {
              console.log(`Generating thumbnail for page ${i}`);
              pdfRef.current.generateThumbnail(i);
            }
          } catch (error) {
            console.error(`Error generating thumbnail for page ${i}:`, error);
          }
        }
      }, 1000); // Longer delay to ensure PDF is fully loaded
    }
  };

  const handlePageChange = (event: PageChangeEvent) => {
    console.log('Page changed:', event);
    setCurrentPage(event.page + 1); // Convert from 0-indexed to 1-indexed
    setPageInput((event.page + 1).toString());
  };

  const handleScaleChange = (event: ScaleChangeEvent) => {
    console.log('Scale changed:', event);
    setCurrentScale(event.scale);
  };

  const handleError = (event: ErrorEvent) => {
    console.error('PDF error:', event);
    Alert.alert('PDF Error', `${event.message}\nCode: ${event.code}`);
  };

  const handleThumbnailGenerated = (event: ThumbnailGeneratedEvent) => {
    console.log('Thumbnail generated:', event.page);
    setThumbnails((prev) => {
      const newMap = new Map(prev);
      newMap.set(event.page, event.uri);
      return newMap;
    });
  };

  const handleLoadingChange = (event: LoadingChangeEvent) => {
    console.log('Loading state changed:', event.isLoading);
    setIsLoading(event.isLoading);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      try {
        if (pdfRef.current?.goToPage) {
          console.log(`Navigating to page ${page - 1} (0-indexed)`);
          pdfRef.current.goToPage(page - 1); // Convert to 0-indexed
          setPageInput(page.toString());
        } else {
          console.warn('goToPage method not available on pdfRef.current');
        }
      } catch (error) {
        console.warn('Error navigating to page:', error);
        Alert.alert('Navigation Error', 'Could not navigate to page');
      }
    }
  };

  const handlePageInputSubmit = () => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page)) {
      goToPage(page);
    } else {
      setPageInput(currentPage.toString());
    }
  };

  const zoomIn = () => {
    const newScale = Math.min(currentScale + zoomStep, maxScale);
    try {
      if (pdfRef.current?.setScale) {
        pdfRef.current.setScale(newScale);
      }
    } catch (error) {
      console.warn('Error zooming in:', error);
    }
  };

  const zoomOut = () => {
    const newScale = Math.max(currentScale - zoomStep, minScale);
    try {
      if (pdfRef.current?.setScale) {
        pdfRef.current.setScale(newScale);
      }
    } catch (error) {
      console.warn('Error zooming out:', error);
    }
  };

  const resetZoom = () => {
    try {
      if (pdfRef.current?.setScale) {
        pdfRef.current.setScale(1.0);
      }
    } catch (error) {
      console.warn('Error resetting zoom:', error);
    }
  };

  const generateAllThumbnails = () => {
    try {
      if (pdfRef.current?.generateAllThumbnails) {
        pdfRef.current.generateAllThumbnails();
        Alert.alert(
          'Generating Thumbnails',
          'Generating thumbnails for all pages...'
        );
      } else {
        console.warn(
          'generateAllThumbnails not available, pdfRef.current:',
          pdfRef.current
        );
        Alert.alert('Error', 'Thumbnail generation not available');
      }
    } catch (error) {
      console.warn('Error generating thumbnails:', error);
      Alert.alert('Error', 'Failed to generate thumbnails');
    }
  };

  const loadNewPdf = () => {
    setShowSourceModal(false);
    setThumbnails(new Map()); // Clear thumbnails

    // Force reload by clearing source first, then setting new one
    if (pdfSource === tempSource) {
      // Same source - force reload
      setPdfSource('');
      setTimeout(() => setPdfSource(tempSource), 100);
    } else {
      // Different source - just set it
      setPdfSource(tempSource);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Main Content */}
      <View style={styles.content}>
        {/* PDF Viewer */}
        <View style={styles.pdfViewerContainer}>
          <PdfViewerView
            hybridRef={callback((ref: PdfViewerRef | null) => {
              pdfRef.current = ref;
            })}
            source={pdfSource}
            style={styles.pdfViewer}
            enableZoom={true}
            minScale={minScale}
            maxScale={maxScale}
            {...(Platform.OS === 'ios' && {
              horizontal: horizontal,
              enablePaging: !enablePaging,
            })}
            spacing={spacing}
            showsActivityIndicator={true}
            contentInsetTop={HEADER_HEIGHT}
            contentInsetBottom={TOOLBAR_HEIGHT}
            onLoadComplete={callback(handleLoadComplete)}
            onPageChange={callback(handlePageChange)}
            onScaleChange={callback(handleScaleChange)}
            onError={callback(handleError)}
            onThumbnailGenerated={callback(handleThumbnailGenerated)}
            onLoadingChange={callback(handleLoadingChange)}
          />

          {/* Loading Overlay */}
          <LoadingOverlay visible={isLoading} />

          {/* Floating Controls */}
          <FloatingControls
            currentScale={currentScale}
            currentPage={currentPage}
            totalPages={totalPages}
            pageInput={pageInput}
            minScale={minScale}
            maxScale={maxScale}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            onPageInputChange={setPageInput}
            onPageInputSubmit={handlePageInputSubmit}
            onPreviousPage={() => goToPage(currentPage - 1)}
            onNextPage={() => goToPage(currentPage + 1)}
          />
        </View>
      </View>

      {/* Floating Thumbnail Sidebar - Outside content for proper absolute positioning */}
      <ThumbnailSidebar
        visible={showThumbnails}
        totalPages={totalPages}
        currentPage={currentPage}
        thumbnails={thumbnails}
        onPagePress={goToPage}
      />

      {/* Header with Blur - Positioned absolutely on top */}
      <Header
        isLoading={isLoading}
        onSourcePress={() => setShowSourceModal(true)}
      />

      {/* Bottom Toolbar */}
      <Toolbar
        showThumbnails={showThumbnails}
        horizontal={horizontal}
        enablePaging={enablePaging}
        spacing={spacing}
        onToggleThumbnails={() => setShowThumbnails(!showThumbnails)}
        onToggleHorizontal={() => setHorizontal(!horizontal)}
        onTogglePaging={() => setEnablePaging(!enablePaging)}
        onToggleSpacing={() => setSpacing(spacing === 10 ? 0 : 10)}
        onGenerateAll={generateAllThumbnails}
      />

      {/* Source Modal */}
      <SourceModal
        visible={showSourceModal}
        tempSource={tempSource}
        onSourceChange={setTempSource}
        onLoad={loadNewPdf}
        onCancel={() => {
          setShowSourceModal(false);
          setTempSource(pdfSource);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    flex: 1,
  },
  pdfViewerContainer: {
    flex: 1,
  },
  pdfViewer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  thumbnailToggleContainer: {
    position: 'absolute',
    top: 270, // Below header with safe area
    left: 20,
    zIndex: 10,
  },
  thumbnailToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(20, 20, 25, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  thumbnailToggleButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  thumbnailToggleIcon: {
    fontSize: 18,
  },
  thumbnailToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
