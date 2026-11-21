import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import 'bento.dart';

typedef PhotoLoader = Future<Uint8List> Function(int index);

/// Keeps each downloaded photo so swiping back and opening the viewer is instant.
class PhotoCache {
  PhotoCache(this.load);

  final PhotoLoader load;
  final _pending = <int, Future<Uint8List>>{};

  Future<Uint8List> get(int index) => _pending[index] ??= load(index).catchError(
    (Object error) {
      _pending.remove(index);
      throw error;
    },
  );

  void retry(int index) => _pending.remove(index);
}

/// A swipeable photo card. Tapping a photo opens it full screen.
class PostGallery extends StatefulWidget {
  const PostGallery({
    super.key,
    required this.count,
    required this.load,
    this.aspectRatio = 4 / 3,
  });

  final int count;
  final PhotoLoader load;
  final double aspectRatio;

  @override
  State<PostGallery> createState() => _PostGalleryState();
}

class _PostGalleryState extends State<PostGallery> {
  late final cache = PhotoCache(widget.load);
  final pages = PageController();
  int current = 0;

  bool get arabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void dispose() {
    pages.dispose();
    super.dispose();
  }

  Future<void> open(int index) => Navigator.of(context).push<void>(
    PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.black,
      transitionDuration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 220),
      pageBuilder: (_, _, _) =>
          PhotoViewer(count: widget.count, cache: cache, initial: index),
      transitionsBuilder: (_, animation, _, child) =>
          FadeTransition(opacity: animation, child: child),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final many = widget.count > 1;
    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: arabic
          ? 'صور المنشور، ${widget.count} صور'
          : 'Post photos, ${widget.count} photos',
      child: AspectRatio(
        aspectRatio: widget.aspectRatio,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Stack(
            fit: StackFit.expand,
            children: [
              PageView.builder(
                controller: pages,
                itemCount: widget.count,
                onPageChanged: (index) => setState(() => current = index),
                itemBuilder: (context, index) {
                  final label = arabic
                      ? 'الصورة ${index + 1} من ${widget.count}. اضغط للتكبير'
                      : 'Photo ${index + 1} of ${widget.count}. Tap to enlarge';
                  // A button for screen readers as well as touch.
                  return Semantics(
                    button: true,
                    label: label,
                    onTap: () => open(index),
                    excludeSemantics: true,
                    child: GestureDetector(
                      onTap: () => open(index),
                      child: CachedPhoto(
                        cache: cache,
                        index: index,
                        fit: BoxFit.cover,
                        label: label,
                      ),
                    ),
                  );
                },
              ),
              if (many)
                PositionedDirectional(
                  top: 10,
                  end: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: .55),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      '${current + 1}/${widget.count}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              if (many)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 10,
                  child: ExcludeSemantics(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var index = 0; index < widget.count; index++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            width: index == current ? 18 : 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: index == current
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: .55),
                              borderRadius: BorderRadius.circular(99),
                              boxShadow: const [
                                BoxShadow(color: Colors.black26, blurRadius: 4),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              if (many)
                PositionedDirectional(
                  bottom: 6,
                  end: 6,
                  child: Icon(
                    Icons.zoom_out_map,
                    size: 18,
                    color: colors.onPrimary.withValues(alpha: .9),
                    shadows: const [Shadow(blurRadius: 6)],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class CachedPhoto extends StatefulWidget {
  const CachedPhoto({
    super.key,
    required this.cache,
    required this.index,
    required this.fit,
    required this.label,
  });

  final PhotoCache cache;
  final int index;
  final BoxFit fit;
  final String label;

  @override
  State<CachedPhoto> createState() => _CachedPhotoState();
}

class _CachedPhotoState extends State<CachedPhoto> {
  late Future<Uint8List> image = widget.cache.get(widget.index);

  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List>(
    future: image,
    builder: (context, snapshot) {
      if (snapshot.hasData) {
        return Image.memory(
          snapshot.data!,
          fit: widget.fit,
          gaplessPlayback: true,
          semanticLabel: widget.label,
        );
      }
      if (snapshot.hasError) {
        final arabic = Localizations.localeOf(context).languageCode == 'ar';
        return Center(
          child: IconButton.filledTonal(
            tooltip: arabic ? 'أعد تحميل الصورة' : 'Retry photo',
            icon: const Icon(Icons.refresh),
            onPressed: () => setState(() {
              widget.cache.retry(widget.index);
              image = widget.cache.get(widget.index);
            }),
          ),
        );
      }
      return const ShimmerBlock(height: double.infinity);
    },
  );
}

/// Full-screen photos: swipe between them, pinch or double-tap to zoom.
class PhotoViewer extends StatefulWidget {
  const PhotoViewer({
    super.key,
    required this.count,
    required this.cache,
    this.initial = 0,
  });

  final int count;
  final PhotoCache cache;
  final int initial;

  @override
  State<PhotoViewer> createState() => _PhotoViewerState();
}

class _PhotoViewerState extends State<PhotoViewer> {
  late final pages = PageController(initialPage: widget.initial);
  late int current = widget.initial;
  final zooms = <int, TransformationController>{};
  bool zoomed = false;
  Offset? lastTap;

  bool get arabic => Localizations.localeOf(context).languageCode == 'ar';

  TransformationController zoomFor(int index) => zooms.putIfAbsent(index, () {
    final controller = TransformationController();
    controller.addListener(() {
      final isZoomed = controller.value.getMaxScaleOnAxis() > 1.01;
      if (index == current && isZoomed != zoomed) {
        setState(() => zoomed = isZoomed);
      }
    });
    return controller;
  });

  @override
  void dispose() {
    pages.dispose();
    for (final controller in zooms.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void toggleZoom(int index) {
    final controller = zoomFor(index);
    if (controller.value.getMaxScaleOnAxis() > 1.01) {
      controller.value = Matrix4.identity();
      return;
    }
    final point = lastTap ?? Offset.zero;
    const scale = 2.5;
    controller.value = Matrix4.identity()
      ..translateByDouble(-point.dx * (scale - 1), -point.dy * (scale - 1), 0, 1)
      ..scaleByDouble(scale, scale, 1, 1);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: pages,
            itemCount: widget.count,
            physics: zoomed
                ? const NeverScrollableScrollPhysics()
                : const PageScrollPhysics(),
            onPageChanged: (index) {
              zooms[current]?.value = Matrix4.identity();
              setState(() {
                current = index;
                zoomed = false;
              });
            },
            itemBuilder: (context, index) => GestureDetector(
              onDoubleTapDown: (details) => lastTap = details.localPosition,
              onDoubleTap: () => toggleZoom(index),
              child: InteractiveViewer(
                transformationController: zoomFor(index),
                minScale: 1,
                maxScale: 5,
                child: SizedBox.expand(
                  child: CachedPhoto(
                    cache: widget.cache,
                    index: index,
                    fit: BoxFit.contain,
                    label: arabic
                        ? 'الصورة ${index + 1} من ${widget.count}'
                        : 'Photo ${index + 1} of ${widget.count}',
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton.filledTonal(
                    tooltip: arabic ? 'إغلاق' : 'Close',
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  if (widget.count > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: .16),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        '${current + 1} / ${widget.count}',
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (!zoomed)
            Positioned(
              left: 0,
              right: 0,
              bottom: 24,
              child: SafeArea(
                child: Text(
                  arabic
                      ? 'اسحب للتنقل · المس مرتين أو باعد بإصبعين للتكبير'
                      : 'Swipe to browse · Double-tap or pinch to zoom',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
