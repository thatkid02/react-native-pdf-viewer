import { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  SafeAreaView,
  StatusBar,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
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
import { ProgressiveBlurView } from 'react-native-progressive-blur';

const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_HEIGHT = 160;

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
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [showSourceModal, setShowSourceModal] = useState<boolean>(false);
  const [tempSource, setTempSource] = useState<string>(pdfSource);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
      setTimeout(() => {
        const pagesToGenerate = Math.min(5, event.pageCount);
        for (let i = 0; i < pagesToGenerate; i++) {
          try {
            if (pdfRef.current?.generateThumbnail) {
              pdfRef.current.generateThumbnail(i);
            }
          } catch (error) {
            console.error(`Error generating thumbnail for page ${i}:`, error);
          }
        }
      }, 500);
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
        onPress={() => goToPage(page + 1)}
      >
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={styles.thumbnailImage} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Text style={styles.thumbnailPlaceholderText}>Loading...</Text>
          </View>
        )}
        <Text style={styles.thumbnailPageNumber}>Page {page + 1}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Main Content */}
      <View style={styles.content}>
        {/* Thumbnail Sidebar */}
        {showThumbnails && (
          <View style={styles.thumbnailSidebar}>
            <View style={styles.thumbnailHeader}>
              <Text style={styles.thumbnailTitle}>Pages</Text>
              <TouchableOpacity
                style={styles.generateAllButton}
                onPress={generateAllThumbnails}
              >
                <Text style={styles.generateAllButtonText}>Generate All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.thumbnailList}>
              {Array.from({ length: totalPages }, (_, i) => renderThumbnail(i))}
            </ScrollView>
          </View>
        )}

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
              enablePaging: enablePaging,
            })}
            spacing={spacing}
            showsActivityIndicator={true}
            onLoadComplete={callback(handleLoadComplete)}
            onPageChange={callback(handlePageChange)}
            onScaleChange={callback(handleScaleChange)}
            onError={callback(handleError)}
            onThumbnailGenerated={callback(handleThumbnailGenerated)}
            onLoadingChange={callback(handleLoadingChange)}
          />

          {/* Loading Overlay */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading PDF...</Text>
            </View>
          )}

          {/* Floating Controls */}
          <View style={styles.floatingControls}>
            {/* Zoom Controls */}
            <View style={styles.zoomControls}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  currentScale <= minScale && styles.controlButtonDisabled,
                ]}
                onPress={zoomOut}
                disabled={currentScale <= minScale}
              >
                <Text style={styles.controlButtonText}>−</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.scaleDisplay} onPress={resetZoom}>
                <Text style={styles.scaleText}>
                  {Math.round(currentScale * 100)}%
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.controlButton,
                  currentScale >= maxScale && styles.controlButtonDisabled,
                ]}
                onPress={zoomIn}
                disabled={currentScale >= maxScale}
              >
                <Text style={styles.controlButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Page Navigation */}
            <View style={styles.pageControls}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  currentPage <= 1 && styles.controlButtonDisabled,
                ]}
                onPress={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <Text style={styles.controlButtonText}>‹</Text>
              </TouchableOpacity>

              <View style={styles.pageInputContainer}>
                <TextInput
                  style={styles.pageInput}
                  value={pageInput}
                  onChangeText={setPageInput}
                  onSubmitEditing={handlePageInputSubmit}
                  onBlur={handlePageInputSubmit}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Text style={styles.pageTotal}>/ {totalPages}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.controlButton,
                  currentPage >= totalPages && styles.controlButtonDisabled,
                ]}
                onPress={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <Text style={styles.controlButtonText}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Header with Blur - Positioned absolutely on top */}
      <View style={styles.header} pointerEvents="box-none">
        {Platform.OS === 'ios' && (
          <ProgressiveBlurView
            style={StyleSheet.absoluteFill}
            direction="topToBottom"
            intensity={9}
            tint="dark"
            locations={[0.4, 0.9]}
          />
        )}
        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>PDF Viewer Pro</Text>
            {isLoading && <Text style={styles.loadingText}>Loading...</Text>}
          </View>
          <TouchableOpacity
            style={styles.sourceButton}
            onPress={() => {
              console.log('Source button pressed, opening modal');
              setShowSourceModal(true);
            }}
          >
            <Text style={styles.sourceButtonText}>📄 Source</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[
            styles.toolbarButton,
            showThumbnails && styles.toolbarButtonActive,
          ]}
          onPress={() => setShowThumbnails(!showThumbnails)}
        >
          <Text style={styles.toolbarButtonText}>
            {showThumbnails ? '📑 Hide' : '📑 Thumbnails'}
          </Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <>
            <TouchableOpacity
              style={[
                styles.toolbarButton,
                horizontal && styles.toolbarButtonActive,
              ]}
              onPress={() => setHorizontal(!horizontal)}
            >
              <Text style={styles.toolbarButtonText}>
                {horizontal ? '↔️ Horizontal' : '↕️ Vertical'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toolbarButton,
                enablePaging && styles.toolbarButtonActive,
              ]}
              onPress={() => setEnablePaging(!enablePaging)}
            >
              <Text style={styles.toolbarButtonText}>
                {enablePaging ? '📄 Paging' : '📜 Scroll'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={() => setSpacing(spacing === 10 ? 0 : 10)}
        >
          <Text style={styles.toolbarButtonText}>📏 {spacing}px</Text>
        </TouchableOpacity>
      </View>

      {/* Source Modal */}
      <Modal
        visible={showSourceModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSourceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Load PDF</Text>

            <Text style={styles.modalLabel}>Enter PDF URL or file path:</Text>
            <TextInput
              style={styles.modalInput}
              value={tempSource}
              onChangeText={setTempSource}
              placeholder="https://example.com/file.pdf"
              placeholderTextColor="#999"
              multiline
              autoFocus
            />

            <Text style={styles.modalHint}>Examples:</Text>
            <ScrollView style={styles.exampleList}>
              <TouchableOpacity
                style={styles.exampleItem}
                onPress={() =>
                  setTempSource(
                    'https://proceedings.neurips.cc/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf'
                  )
                }
              >
                <Text style={styles.exampleText}>🔬 Neural Network Paper</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exampleItem}
                onPress={() =>
                  setTempSource(
                    'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
                  )
                }
              >
                <Text style={styles.exampleText}>📝 Sample PDF</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowSourceModal(false);
                  setTempSource(pdfSource);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonLoad]}
                onPress={loadNewPdf}
              >
                <Text
                  style={[styles.modalButtonText, styles.modalButtonTextLoad]}
                >
                  Load PDF
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 10,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  sourceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  sourceButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  thumbnailSidebar: {
    width: THUMBNAIL_WIDTH + 32,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  thumbnailHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  thumbnailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  generateAllButton: {
    backgroundColor: '#007AFF',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  generateAllButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  thumbnailList: {
    flex: 1,
  },
  thumbnailItem: {
    margin: 8,
    padding: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  thumbnailItemActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  thumbnailImage: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 12,
    color: '#999',
  },
  thumbnailPageNumber: {
    marginTop: 4,
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pdfViewer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  floatingControls: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  pageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  controlButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  controlButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.5,
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  scaleDisplay: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  scaleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pageInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    minWidth: 40,
    textAlign: 'center',
    padding: 0,
  },
  pageTotal: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  toolbarButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: '#007AFF',
  },
  toolbarButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    fontWeight: '500',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    marginBottom: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalHint: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginBottom: 8,
  },
  exampleList: {
    maxHeight: 150,
    marginBottom: 20,
  },
  exampleItem: {
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 14,
    color: '#007AFF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonLoad: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalButtonTextLoad: {
    color: '#fff',
  },
  pdfViewerContainer: {
    flex: 1,
  },
});
