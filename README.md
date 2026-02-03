# react-native-pdf-viewer

[![npm version](https://badge.fury.io/js/@thatkid02%2Freact-native-pdf-viewer.svg)](https://www.npmjs.com/package/@thatkid02/react-native-pdf-viewer)
[![npm downloads](https://img.shields.io/npm/dm/@thatkid02/react-native-pdf-viewer.svg)](https://www.npmjs.com/package/@thatkid02/react-native-pdf-viewer)

High-performance PDF viewer for React Native, built with [Nitro Modules](https://nitro.margelo.com/) for native rendering performance.

<video src="docs/pdf.mp4" controls></video>

## Features

✅ **High-performance PDF rendering** with native APIs (PDFKit on iOS, PdfRenderer on Android)  
✅ **Pinch-to-zoom and pan gestures** - Smooth, native gesture handling  
✅ **Thumbnail generation** for page previews  
✅ **Local and remote PDF support** (file://, http://, https://)  
✅ **Page navigation** with events  
✅ **TypeScript support** - Full type safety  
✅ **Memory efficient** - Virtualizes pages, only renders visible content  
✅ **iOS-specific layouts** - Horizontal scroll and paging modes  

## Platform Support

| Feature | Android | iOS | Notes |
|---------|---------|-----|-------|
| Local Files (file://) | ✅ | ✅ | |
| Remote URLs (http/https) | ✅ | ✅ | Prefer HTTPS in production |
| Zoom Controls | ✅(2 scale) | ✅ | |
| Page Navigation | ✅ | ✅ | |
| Horizontal Scroll | ❌ | ✅ | iOS only |
| Paging Mode | ❌ | ✅ | iOS only |
| Thumbnail Generation | ✅ | ✅ | Async on both platforms |

## Installation

```sh
npm install @thatkid02/react-native-pdf-viewer react-native-nitro-modules
```

> `react-native-nitro-modules` is required as this library relies on [Nitro Modules](https://nitro.margelo.com/).

## Usage

### Basic Example

```tsx
import { PdfViewerView } from '@thatkid02/react-native-pdf-viewer';

export default function App() {
  return (
    <PdfViewerView
      source="https://example.com/document.pdf"
      style={{ flex: 1 }}
      onLoadComplete={(event) => {
        console.log('PDF loaded:', event.pageCount, 'pages');
      }}
      onError={(event) => {
        console.error('PDF error:', event.message);
      }}
    />
  );
}
```

### Advanced Example with All Features

  - callback is exposed by nitro modules to avoid re-renders [here](https://nitro.margelo.com/docs/view-components#callbacks-have-to-be-wrapped)

```tsx
import React, { useRef } from 'react';
import { View, Button, StyleSheet } from 'react-native';
import { PdfViewerView, type PdfViewer } from '@thatkid02/react-native-pdf-viewer';

export default function AdvancedPdfViewer() {
  const pdfRef = useRef<PdfViewer>(null);
  
  const handleLoadComplete = (event) => {
    console.log(`PDF loaded: ${event.pageCount} pages`);
    console.log(`Page size: ${event.pageWidth}x${event.pageHeight}`);
    
    // Generate thumbnails for all pages
    pdfRef.current?.generateAllThumbnails();
  };
  
  const handlePageChange = (event) => {
    console.log(`Current page: ${event.page + 1} of ${event.pageCount}`);
  };
  
  const handleScaleChange = (event) => {
    console.log(`Zoom scale: ${event.scale}`);
  };
  
  const handleThumbnailGenerated = (event) => {
    console.log(`Thumbnail for page ${event.page}: ${event.uri}`);
  };
  
  const goToPage = (page: number) => {
    pdfRef.current?.goToPage(page);
  };
  
  const zoomIn = () => {
    pdfRef.current?.setScale(2.0);
  };
  

  return (
    <View style={styles.container}>
      <PdfViewerView
        hybridRef={callback((ref: PdfViewerRef | null) => {
        source="https://example.com/document.pdf"
        style={styles.pdf}
        // Layout options
        spacing={16}
        enableZoom={true}
        minScale={0.5}
        maxScale={5.0}
        // iOS-only options
        horizontal={false} // iOS only
        enablePaging={false} // iOS only
        // Loading indicator
        showsActivityIndicator={true}
        // Event handlers
        onLoadComplete={callback(handleLoadComplete)}
        onPageChange={callback(handlePageChange)}
        onScaleChange={callback(handleScaleChange)}
        onError={callback(handleError)}
        onThumbnailGenerated={callback(handleThumbnailGenerated)}
        onLoadingChange={callback(handleLoadingChange)}
      />
      
      <View style={styles.controls}>
        <Button title="Go to Page 5" onPress={() => goToPage(4)} />
        <Button title="Zoom In" onPress={zoomIn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pdf: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
  },
});
```

### Loading Local Files

```tsx
<PdfViewerView
  source="file:///path/to/document.pdf"
  style={{ flex: 1 }}
/>
```

### iOS-Specific Features

```tsx
// Horizontal scrolling (iOS only)
<PdfViewerView
  source="https://example.com/document.pdf"
  horizontal={true}
  style={{ flex: 1 }}
/>

// Paging mode with swipe transitions (iOS only)
<PdfViewerView
  source="https://example.com/document.pdf"
  enablePaging={true}
  style={{ flex: 1 }}
/>
```

## API Reference

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `string` | - | PDF source URI (file://, http://, https://) |
| `spacing` | `number` | `8` | Space between pages in pixels |
| `enableZoom` | `boolean` | `true` | Enable pinch-to-zoom gestures |
| `minScale` | `number` | `0.5` | Minimum zoom scale |
| `maxScale` | `number` | `4.0` | Maximum zoom scale |
| `showsActivityIndicator` | `boolean` | `true` | Show loading indicator |
| `horizontal` | `boolean` | `false` | Horizontal scroll (iOS only) |
| `enablePaging` | `boolean` | `false` | Enable paging mode (iOS only) |
| `contentInsetTop` | `number` | `0` | Top content inset (for glass topbars) |
| `contentInsetBottom` | `number` | `0` | Bottom content inset (for glass toolbars) |
| `contentInsetLeft` | `number` | `0` | Left content inset |
| `contentInsetRight` | `number` | `0` | Right content inset |
| `onLoadComplete` | `(event) => void` | - | Called when PDF loads |
| `onPageChange` | `(event) => void` | - | Called when page changes |
| `onScaleChange` | `(event) => void` | - | Called when zoom changes |
| `onError` | `(event) => void` | - | Called on error |
| `onThumbnailGenerated` | `(event) => void` | - | Called when thumbnail is ready |
| `onLoadingChange` | `(event) => void` | - | Called when loading state changes |

#### Glass UI / Transparent Bars

Use `contentInset` props to make the PDF scroll behind transparent headers and toolbars:

```tsx
<PdfViewerView
  source="https://example.com/document.pdf"
  contentInsetTop={80}      // Height of your transparent top bar
  contentInsetBottom={60}    // Height of your transparent bottom toolbar
  style={{ flex: 1 }}
/>
```

This creates a modern "glass" effect where:
- PDF content starts below the top bar
- Content scrolls behind transparent bars
- Content ends above the bottom toolbar

### Methods

Access methods via ref:

```tsx
const pdfRef = useRef<PdfViewer>(null);

// Navigate to specific page (0-indexed)
pdfRef.current?.goToPage(pageIndex);

// Set zoom scale
pdfRef.current?.setScale(2.0);

// Generate thumbnail for specific page
pdfRef.current?.generateThumbnail(pageIndex);

// Generate thumbnails for all pages
pdfRef.current?.generateAllThumbnails();
```

### Events

#### LoadCompleteEvent
```typescript
{
  pageCount: number;    // Total number of pages
  pageWidth: number;    // Width of first page
  pageHeight: number;   // Height of first page
}
```

#### PageChangeEvent
```typescript
{
  page: number;         // Current page index (0-based)
  pageCount: number;    // Total pages
}
```

#### ScaleChangeEvent
```typescript
{
  scale: number;        // Current zoom scale
}
```

#### ErrorEvent
```typescript
{
  message: string;      // Error description
  code: string;         // Error code (e.g., "FILE_NOT_FOUND")
}
```

#### ThumbnailGeneratedEvent
```typescript
{
  page: number;         // Page index
  uri: string;          // File URI of thumbnail image
}
```

## Performance

- **Memory efficient**: Virtualizes pages, only renders visible content
- **Smooth scrolling**: 60 FPS on most devices
- **Large PDFs**: Tested with 500+ page documents
- **Smart caching**: Automatic memory management with LRU cache

## Troubleshooting

### PDF fails to load from URL

Ensure the URL is accessible and returns a valid PDF. For production apps, always use HTTPS URLs for security.

### Out of memory errors on large PDFs

The library automatically manages memory, but for very large documents at high zoom levels:
- Limit `maxScale` to reduce memory usage
- The Android implementation dynamically reduces quality at high zoom levels

### iOS horizontal/paging mode not working

These features are iOS-only. On Android, the viewer always uses vertical scrolling.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
