# react-native-pdf-viewer

[![npm version](https://badge.fury.io/js/@thatkid02%2Freact-native-pdf-viewer.svg)](https://www.npmjs.com/package/@thatkid02/react-native-pdf-viewer)
[![npm downloads](https://img.shields.io/npm/dm/@thatkid02/react-native-pdf-viewer.svg)](https://www.npmjs.com/package/@thatkid02/react-native-pdf-viewer)

High-performance PDF viewer for React Native, built with [Nitro Modules](https://nitro.margelo.com/) for native rendering.

<p align="center">
  <video src="docs/pdf.mp4" width="300" controls></video>
</p>

## Features

- 📄 **Native PDF rendering** — PDFKit (iOS) & PdfRenderer (Android)
- 🔍 **Pinch-to-zoom & pan** — Smooth gesture handling
- 🖼️ **Thumbnail generation** — Async page previews
- 🌐 **Local & remote files** — `file://`, `http://`, `https://`
- 📱 **iOS layouts** — Horizontal scroll & paging modes
- 💾 **Memory efficient** — Virtualized pages, LRU cache

## Installation

```sh
npm install @thatkid02/react-native-pdf-viewer react-native-nitro-modules
```

### iOS

```sh
cd ios && pod install
```

## Quick Start

```tsx
import { PdfViewerView } from '@thatkid02/react-native-pdf-viewer';

function App() {
  return (
    <PdfViewerView
      source="https://example.com/document.pdf"
      style={{ flex: 1 }}
      onLoadComplete={(e) => console.log(`Loaded ${e.pageCount} pages`)}
      onError={(e) => console.error(e.message)}
    />
  );
}
```

## Usage with Ref

Callbacks must be wrapped with `callback()` from nitro-modules to avoid re-renders. [Learn more](https://nitro.margelo.com/docs/view-components#callbacks-have-to-be-wrapped)

```tsx
import { useRef } from 'react';
import { View, Button } from 'react-native';
import { 
  PdfViewerView, 
  callback,
  type PdfViewerRef 
} from '@thatkid02/react-native-pdf-viewer';

function PdfScreen() {
  const pdfRef = useRef<PdfViewerRef>(null);

  return (
    <View style={{ flex: 1 }}>
      <PdfViewerView
        hybridRef={callback((ref) => { pdfRef.current = ref; })}
        source="https://example.com/document.pdf"
        style={{ flex: 1 }}
        enableZoom={true}
        minScale={0.5}
        maxScale={4.0}
        onLoadComplete={callback((e) => {
          console.log(`${e.pageCount} pages, ${e.pageWidth}x${e.pageHeight}`);
        })}
        onPageChange={callback((e) => {
          console.log(`Page ${e.page} of ${e.pageCount}`);
        })}
        onThumbnailGenerated={callback((e) => {
          console.log(`Thumbnail page ${e.page}: ${e.uri}`);
        })}
      />
      
      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        <Button title="Page 1" onPress={() => pdfRef.current?.goToPage(0)} />
        <Button title="Zoom 2x" onPress={() => pdfRef.current?.setScale(2)} />
        <Button title="Thumbnails" onPress={() => pdfRef.current?.generateAllThumbnails()} />
      </View>
    </View>
  );
}
```

## iOS-Only Features

```tsx
// Horizontal scrolling
<PdfViewerView source={url} horizontal={true} />

// Paging mode (swipe between pages)
<PdfViewerView source={url} enablePaging={true} />

// Combined
<PdfViewerView source={url} horizontal={true} enablePaging={true} />
```

## Glass UI / Transparent Bars

Content scrolls behind transparent headers/toolbars:

```tsx
<PdfViewerView
  source={url}
  contentInsetTop={100}    // Header height
  contentInsetBottom={80}  // Toolbar height
  style={{ flex: 1 }}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `string` | — | PDF URI (`file://`, `http://`, `https://`) |
| `spacing` | `number` | `8` | Space between pages (px) |
| `enableZoom` | `boolean` | `true` | Enable pinch-to-zoom |
| `minScale` | `number` | `0.5` | Minimum zoom scale |
| `maxScale` | `number` | `4.0` | Maximum zoom scale |
| `showsActivityIndicator` | `boolean` | `true` | Show loading spinner |
| `horizontal` | `boolean` | `false` | Horizontal scroll *(iOS only)* |
| `enablePaging` | `boolean` | `false` | Paging mode *(iOS only)* |
| `contentInsetTop` | `number` | `0` | Top inset for glass UI |
| `contentInsetBottom` | `number` | `0` | Bottom inset for glass UI |
| `contentInsetLeft` | `number` | `0` | Left inset |
| `contentInsetRight` | `number` | `0` | Right inset |

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `onLoadComplete` | `{ pageCount, pageWidth, pageHeight }` | PDF loaded successfully |
| `onPageChange` | `{ page, pageCount }` | Visible page changed |
| `onScaleChange` | `{ scale }` | Zoom level changed |
| `onError` | `{ message, code }` | Error occurred |
| `onThumbnailGenerated` | `{ page, uri }` | Thumbnail ready |
| `onLoadingChange` | `{ isLoading }` | Loading state changed |

## Methods

```tsx
const pdfRef = useRef<PdfViewerRef>(null);

// Navigate to page (0-indexed)
pdfRef.current?.goToPage(0);

// Set zoom level
pdfRef.current?.setScale(2.0);

// Generate single thumbnail
pdfRef.current?.generateThumbnail(0);

// Generate all thumbnails
pdfRef.current?.generateAllThumbnails();

// Get document info
const info = pdfRef.current?.getDocumentInfo();
// { pageCount, pageWidth, pageHeight, currentPage }
```

## Platform Differences

| Feature | Android | iOS |
|---------|:-------:|:---:|
| Vertical scroll | ✅ | ✅ |
| Horizontal scroll | — | ✅ |
| Paging mode | — | ✅ |
| Pinch-to-zoom | ✅ | ✅ |
| Double-tap zoom | ✅ | ✅ |
| Pan when zoomed | ✅ | ✅ |
| Thumbnails | ✅ | ✅ |
| Remote URLs | ✅ | ✅ |
| Local files | ✅ | ✅ |

## Thumbnail Caching

Thumbnails are automatically cached on disk and in memory. When you call `generateThumbnail()`:

1. **Memory cache** is checked first (instant)
2. **Disk cache** is checked next (fast)
3. **Generated on-demand** if not cached (async)

This means multiple `PdfViewerView` instances with the same URL share cached thumbnails:

```tsx
// Main viewer
<PdfViewerView
  source={pdfUrl}
  hybridRef={callback((ref) => { mainRef.current = ref; })}
  onThumbnailGenerated={callback((e) => {
    // Thumbnail generated by main viewer is cached
    setThumbnails(prev => new Map(prev).set(e.page, e.uri));
  })}
/>

// Carousel - can request thumbnails even before its PDF loads
// Will return cached thumbnails instantly if main viewer already generated them
<PdfViewerView
  source={pdfUrl}  // Same URL = same cache
  hybridRef={callback((ref) => {
    // Request thumbnail - returns from cache if available
    ref?.generateThumbnail(0);
  })}
  onThumbnailGenerated={callback((e) => {
    setCarouselThumbnail(e.uri);
  })}
/>
```

**Note:** If `generateThumbnail()` is called before the document loads, the request is queued and processed automatically once loading completes.

## Troubleshooting

**PDF fails to load from URL**  
Ensure the URL is accessible. Use HTTPS in production.

**Out of memory on large PDFs**  
Lower `maxScale` to reduce memory usage. The viewer automatically manages memory with dynamic quality scaling.

**Horizontal/paging not working**  
These are iOS-only features. Android uses vertical scroll.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## License

MIT
