import 'package:material_ui/material_ui.dart';

/// Mirrors the shared sizes in web/layout-standards.css in logical pixels.
abstract final class SchoolLayout {
  static const controlHeight = 48.0;
  static const labelSize = 14.0;
  static const bodySize = 16.0;
  static const controlRadius = 12.0;
  static const mediumSpace = 12.0;
  static const largeSpace = 16.0;

  static const actionStyle = ButtonStyle(
    minimumSize: WidgetStatePropertyAll(Size(controlHeight, controlHeight)),
    shape: WidgetStatePropertyAll(
      RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(controlRadius)),
      ),
    ),
    // Button text replaces the theme's text style, so it needs the Arabic
    // fallback itself; without it the web app shows empty boxes for Arabic.
    textStyle: WidgetStatePropertyAll(
      TextStyle(fontSize: labelSize, fontFamilyFallback: ['Noto Sans Arabic']),
    ),
  );
}
