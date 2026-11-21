import 'dart:async';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'workspace_store.dart';
import 'workspace.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isWindows) {
    await const MethodChannel('islanddesk/platform')
        .invokeMethod<void>('window', {'compact': false});
  }
  try {
    runApp(IslandDesk(store: await WorkspaceStore.load()));
  } catch (error) {
    runApp(
      MaterialApp(
        theme: ThemeData.dark(),
        home: Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: SelectableText(
                'Island Desk could not open its workspace. Your existing files have not been changed.\n\n$error',
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class IslandDesk extends StatefulWidget {
  final WorkspaceStore store;
  final bool? desktop;
  const IslandDesk({super.key, required this.store, this.desktop});
  @override
  State<IslandDesk> createState() => _IslandDeskState();
}

class _IslandDeskState extends State<IslandDesk> with WidgetsBindingObserver {
  int selected = 0;
  bool compact = false;
  Timer? clock;
  final labels = [
    'Translate',
    'Notes',
    'Tasks',
    'Calculator',
    'Focus',
    'Tools',
    'Shortcuts',
  ];
  final icons = [
    Icons.translate_rounded,
    Icons.edit_note_rounded,
    Icons.checklist_rounded,
    Icons.calculate_outlined,
    Icons.timer_outlined,
    Icons.tune_rounded,
    Icons.open_in_new_rounded,
  ];
  bool get desktop => widget.desktop ?? Platform.isWindows;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.store.addListener(changed);
    clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void changed() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) unawaited(widget.store.flush());
  }

  @override
  void dispose() {
    clock?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    widget.store.removeListener(changed);
    super.dispose();
  }

  Future<void> fold() async {
    setState(() => compact = !compact);
    if (desktop) {
      await const MethodChannel('islanddesk/platform')
          .invokeMethod<void>('window', {'compact': compact});
    }
  }

  @override
  Widget build(BuildContext context) {
    const mint = Color(0xffa6e1c5);
    const glassEdge = Color(0x52b7d8ff);
    const surface = Color(0xff182537);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Island Desk Flutter',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: mint,
          brightness: Brightness.dark,
          surface: surface,
          onSurface: const Color(0xffedf2f7),
          onSurfaceVariant: const Color(0xffbbc9da),
          secondaryContainer: const Color(0xff354f69),
          onSecondaryContainer: const Color(0xffedf2f7),
          primary: mint,
        ),
        scaffoldBackgroundColor: Colors.transparent,
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xcc263b53),
          foregroundColor: Color(0xffedf2f7),
        ),
        navigationRailTheme: const NavigationRailThemeData(
          backgroundColor: Color(0xcc182537),
        ),
        navigationDrawerTheme: const NavigationDrawerThemeData(
          backgroundColor: surface,
        ),
        useMaterial3: true,
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xff202f43),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: glassEdge),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xffa5d3ff), width: 2),
          ),
        ),
        cardTheme: CardThemeData(
          color: surface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            side: const BorderSide(color: glassEdge),
            borderRadius: BorderRadius.circular(18),
          ),
        ),
      ),
      builder: (context, child) => DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xff304963), Color(0xff132034), Color(0xff183038)],
          ),
        ),
        child: child,
      ),
      home: Builder(
        builder: (context) {
          if (compact) {
            return Scaffold(
              body: SafeArea(
                child: InkWell(
                  onTap: fold,
                  borderRadius: BorderRadius.circular(24),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 12,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.blur_on_rounded, color: mint),
                        const SizedBox(width: 12),
                        const Text('Island Desk'),
                        const Spacer(),
                        Text(TimeOfDay.now().format(context)),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }
          return LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 760;
              return Scaffold(
                appBar: AppBar(
                  title: const Text(
                    'Island Desk',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  actions: [
                    if (desktop)
                      IconButton(
                        tooltip: 'Fold island',
                        onPressed: fold,
                        icon: const Icon(Icons.unfold_less_rounded),
                      ),
                    IconButton(
                      tooltip: 'About this version',
                      icon: const Icon(Icons.info_outline_rounded),
                      onPressed: () => showAboutDialog(
                        context: context,
                        applicationName: 'Island Desk Flutter',
                        applicationVersion: '0.10.0 preview',
                        children: [
                          const Text(
                            'Shared Windows and Android workspace. Notes, tasks and focus stay local. Translation is an online tool. This preview does not replace the existing launcher integrations.',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                drawer: wide
                    ? null
                    : NavigationDrawer(
                        selectedIndex: selected,
                        onDestinationSelected: (i) {
                          setState(() => selected = i);
                          Navigator.pop(context);
                        },
                        children: [
                          const Padding(
                            padding: EdgeInsets.all(24),
                            child: Text('Workspace'),
                          ),
                          for (var i = 0; i < labels.length; i++)
                            NavigationDrawerDestination(
                              icon: Icon(icons[i]),
                              label: Text(labels[i]),
                            ),
                        ],
                      ),
                body: SafeArea(
                  child: Column(
                    children: [
                      if (widget.store.saveError != null)
                        MaterialBanner(
                          content: Text(widget.store.saveError!),
                          actions: [
                            TextButton(
                              onPressed: widget.store.changed,
                              child: const Text('Retry save'),
                            ),
                          ],
                        ),
                      Expanded(
                        child: Row(
                          children: [
                            if (wide)
                              NavigationRail(
                                selectedIndex: selected,
                                onDestinationSelected: (i) =>
                                    setState(() => selected = i),
                                labelType: NavigationRailLabelType.all,
                                destinations: [
                                  for (var i = 0; i < labels.length; i++)
                                    NavigationRailDestination(
                                      icon: Icon(icons[i]),
                                      label: Text(labels[i]),
                                    ),
                                ],
                              ),
                            Expanded(
                              child: Padding(
                                padding: EdgeInsets.all(wide ? 24 : 16),
                                child: IndexedStack(
                                  index: selected,
                                  children: [
                                    const TranslationPage(),
                                    NotesPage(store: widget.store),
                                    TasksPage(store: widget.store),
                                    CalculatorPage(store: widget.store),
                                    FocusPage(store: widget.store),
                                    const ToolsPage(),
                                    ShortcutsPage(store: widget.store),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
