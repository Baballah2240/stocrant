import 'package:material_ui/material_ui.dart';

typedef TileData = ({String title, String detail, IconData icon});

class BentoCard extends StatelessWidget {
  const BentoCard({
    super.key,
    required this.tile,
    this.featured = false,
    this.onTap,
  });

  final TileData tile;
  final bool featured;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    final radius = BorderRadius.circular(featured ? 28 : 20);
    final content = ConstrainedBox(
      constraints: BoxConstraints(minHeight: featured ? 150 : 135),
      child: Padding(
        padding: EdgeInsets.all(featured ? 22 : 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(tile.icon, color: colors.primary),
                if (onTap != null) ...[
                  const Spacer(),
                  Icon(Icons.chevron_right, color: colors.primary),
                ],
              ],
            ),
            const SizedBox(height: 10),
            Text(
              tile.title,
              style:
                  (featured
                          ? theme.textTheme.headlineSmall
                          : theme.textTheme.titleMedium)
                      ?.copyWith(
                        color: colors.onSurface,
                        fontWeight: FontWeight.w700,
                      ),
            ),
            const SizedBox(height: 4),
            Text(tile.detail, style: TextStyle(color: colors.onSurface)),
          ],
        ),
      ),
    );
    final card = Material(
      color: colors.surfaceContainer,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: onTap == null
          ? content
          : InkWell(onTap: onTap, borderRadius: radius, child: content),
    );
    return FadeUp(child: card);
  }
}

class FadeUp extends StatelessWidget {
  const FadeUp({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
      child: child,
      builder: (context, progress, child) => Opacity(
        opacity: progress,
        child: Transform.translate(
          offset: Offset(0, 14 * (1 - progress)),
          child: child,
        ),
      ),
    );
  }
}

class ShimmerBlock extends StatefulWidget {
  const ShimmerBlock({super.key, required this.height});

  final double height;

  @override
  State<ShimmerBlock> createState() => _ShimmerBlockState();
}

class _ShimmerBlockState extends State<ShimmerBlock>
    with SingleTickerProviderStateMixin {
  late final AnimationController sweep = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      sweep.stop();
    } else if (!sweep.isAnimating) {
      sweep.repeat();
    }
  }

  @override
  void dispose() {
    sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Semantics(
      label: Localizations.localeOf(context).languageCode == 'ar'
          ? 'جارٍ التحميل'
          : 'Loading',
      child: AnimatedBuilder(
        animation: sweep,
        builder: (context, _) {
          final center = -2 + 4 * sweep.value;
          return Container(
            height: widget.height,
            decoration: BoxDecoration(
              color: colors.surfaceContainer,
              borderRadius: BorderRadius.circular(20),
              gradient: MediaQuery.disableAnimationsOf(context)
                  ? null
                  : LinearGradient(
                      begin: Alignment(center - 1, 0),
                      end: Alignment(center + 1, 0),
                      colors: [
                        colors.surfaceContainer,
                        colors.surface,
                        colors.surfaceContainer,
                      ],
                    ),
            ),
          );
        },
      ),
    );
  }
}
