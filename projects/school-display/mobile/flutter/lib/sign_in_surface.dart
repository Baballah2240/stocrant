import 'dart:ui' show ImageFilter;

import 'package:material_ui/material_ui.dart';

class SignInSurface extends StatelessWidget {
  const SignInSurface({
    super.key,
    required this.schoolName,
    required this.role,
    required this.child,
  });

  final String schoolName;
  final String role;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final dark = theme.brightness == Brightness.dark;
    final solid = MediaQuery.highContrastOf(context);
    final radius = BorderRadius.circular(32);
    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [colors.surfaceContainer, theme.scaffoldBackgroundColor],
            ),
          ),
        ),
        IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(.75, -.5),
                radius: .78,
                colors: [
                  colors.primary.withValues(alpha: dark ? .32 : .20),
                  colors.primary.withValues(alpha: 0),
                ],
              ),
            ),
          ),
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final top = (constraints.maxHeight * .11).clamp(12.0, 78.0);
            return ListView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              padding: EdgeInsets.fromLTRB(20, top, 20, 30),
              children: [
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: colors.surface.withValues(alpha: .86),
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(
                                color: colors.outline.withValues(alpha: .24),
                              ),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Image.asset(
                                'assets/faslii-icon.png',
                                width: 48,
                                height: 48,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          schoolName,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          role,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyLarge,
                        ),
                        const SizedBox(height: 24),
                        ClipRRect(
                          borderRadius: radius,
                          child: BackdropFilter(
                            filter: ImageFilter.blur(
                              sigmaX: solid ? 0 : 14,
                              sigmaY: solid ? 0 : 14,
                            ),
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                borderRadius: radius,
                                color: colors.surface.withValues(
                                  alpha: solid
                                      ? 1
                                      : dark
                                      ? .79
                                      : .83,
                                ),
                                border: Border.all(
                                  color: colors.outline.withValues(
                                    alpha: solid ? 1 : .35,
                                  ),
                                ),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(20),
                                child: child,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}
