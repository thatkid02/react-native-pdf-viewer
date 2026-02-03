package com.margelo.nitro.pdfviewer

import android.view.View
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.uimanager.ThemedReactContext

/**
 * HybridPdfViewer that extends the Nitrogen-generated HybridPdfViewerSpec.
 * This wraps DocumentViewer and connects it to the Nitro interface.
 */
@DoNotStrip
@Keep
class HybridPdfViewer(private val reactContext: ThemedReactContext) : HybridPdfViewerSpec() {
    
    companion object {
        private const val TAG = "HybridPdfViewer"
        
        init {
            if (BuildConfig.DEBUG) {
                android.util.Log.d(TAG, "HybridPdfViewer class initializing...")
            }
            // Load native library before HybridPdfViewerSpec is initialized
            pdfviewerOnLoad.initializeNative()
            if (BuildConfig.DEBUG) {
                android.util.Log.d(TAG, "Native library loaded successfully")
            }
        }
    }
    
    private val documentViewer = PdfViewer(reactContext)
    
    init {
        if (BuildConfig.DEBUG) {
            android.util.Log.d(TAG, "HybridPdfViewer instance created")
        }
    }
    
    override val view: View
        get() = documentViewer
    
    // Connect DocumentViewer callbacks to Nitro callbacks
    init {
        documentViewer.onLoadCompleteCallback = { pageCount, pageWidth, pageHeight ->
            onLoadComplete?.invoke(LoadCompleteEvent(
                pageCount = pageCount.toDouble(),
                pageWidth = pageWidth.toDouble(),
                pageHeight = pageHeight.toDouble()
            ))
        }
        
        documentViewer.onPageChangeCallback = { page, pageCount ->
            onPageChange?.invoke(PageChangeEvent(
                page = page.toDouble(),
                pageCount = pageCount.toDouble()
            ))
        }
        
        documentViewer.onScaleChangeCallback = { scale ->
            onScaleChange?.invoke(ScaleChangeEvent(
                scale = scale.toDouble()
            ))
        }
        
        documentViewer.onErrorCallback = { message, code ->
            onError?.invoke(ErrorEvent(
                message = message,
                code = code
            ))
        }
        
        documentViewer.onThumbnailGeneratedCallback = { page, uri ->
            onThumbnailGenerated?.invoke(ThumbnailGeneratedEvent(
                page = page.toDouble(),
                uri = uri
            ))
        }
        
        documentViewer.onLoadingChangeCallback = { isLoading ->
            onLoadingChange?.invoke(LoadingChangeEvent(
                isLoading = isLoading
            ))
        }
    }
    
    // MARK: - Nitro Properties
    
    override var source: String? = null
        set(value) {
            if (BuildConfig.DEBUG) {
                android.util.Log.d("HybridPdfViewer", "Setting source: $value")
            }
            field = value
            documentViewer.sourceUri = value
        }
    
    // Note: horizontal and enablePaging are iOS-only features, but we keep them
    // here to match the interface. They have no effect on Android.
    override var horizontal: Boolean? = null
        set(value) {
            field = value
            // No-op on Android - always uses vertical scroll
        }
    
    override var enablePaging: Boolean? = null
        set(value) {
            field = value
            // No-op on Android - paging not supported
        }
    
    override var spacing: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.spacing = it.toFloat() }
        }
    
    override var enableZoom: Boolean? = null
        set(value) {
            field = value
            value?.let { documentViewer.enableZoom = it }
        }
    
    override var minScale: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.minScale = it.toFloat() }
        }
    
    override var maxScale: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.maxScale = it.toFloat() }
        }
    
    override var showsActivityIndicator: Boolean? = null
        set(value) {
            field = value
            value?.let { documentViewer.showsActivityIndicator = it }
        }
    
    override var contentInsetTop: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.contentInsetTop = it.toFloat() }
        }
    
    override var contentInsetBottom: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.contentInsetBottom = it.toFloat() }
        }
    
    override var contentInsetLeft: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.contentInsetLeft = it.toFloat() }
        }
    
    override var contentInsetRight: Double? = null
        set(value) {
            field = value
            value?.let { documentViewer.contentInsetRight = it.toFloat() }
        }
    
    // Event callbacks - these are set by Nitro
    override var onLoadComplete: ((event: LoadCompleteEvent) -> Unit)? = null
    override var onPageChange: ((event: PageChangeEvent) -> Unit)? = null
    override var onScaleChange: ((event: ScaleChangeEvent) -> Unit)? = null
    override var onError: ((event: ErrorEvent) -> Unit)? = null
    override var onThumbnailGenerated: ((event: ThumbnailGeneratedEvent) -> Unit)? = null
    override var onLoadingChange: ((event: LoadingChangeEvent) -> Unit)? = null
    
    // MARK: - Nitro Methods
    
    override fun goToPage(page: Double) {
        documentViewer.goToPage(page.toInt())
    }
    
    override fun setScale(scale: Double) {
        documentViewer.setScale(scale.toFloat())
    }
    
    override fun generateThumbnail(page: Double) {
        if (BuildConfig.DEBUG) {
            android.util.Log.d("HybridPdfViewer", "generateThumbnail called for page: $page")
        }
        documentViewer.generateThumbnail(page.toInt())
    }
    
    override fun generateAllThumbnails() {
        documentViewer.generateAllThumbnails()
    }
}
