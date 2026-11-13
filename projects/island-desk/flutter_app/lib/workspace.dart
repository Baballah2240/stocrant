import 'dart:async';
import 'dart:io';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'calculator.dart';
import 'workspace_store.dart';
export 'translation_page.dart';

void notice(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
Widget heading(String title, String subtitle) => Padding(
  padding: const EdgeInsets.only(bottom: 20),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 8),
      Text(
        subtitle,
        style: const TextStyle(color: Color(0xffb0b1bc), height: 1.5),
      ),
    ],
  ),
);

class NotesPage extends StatelessWidget {
  final WorkspaceStore store;
  const NotesPage({super.key, required this.store});
  Future<void> edit(BuildContext context, [Map<String, dynamic>? note]) async {
    final title = TextEditingController(text: note?['title'] ?? ''),
        body = TextEditingController(text: note?['body'] ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(note == null ? 'New note' : 'Edit note'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: title,
                  maxLength: 200,
                  decoration: const InputDecoration(labelText: 'Title'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: body,
                  minLines: 5,
                  maxLines: 10,
                  maxLength: 20000,
                  decoration: const InputDecoration(labelText: 'Your note'),
                  textDirection: RegExp(r'[\u0600-\u06ff]').hasMatch(body.text)
                      ? TextDirection.rtl
                      : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (saved == true &&
        (title.text.trim().isNotEmpty || body.text.trim().isNotEmpty)) {
      final rows = store.rows('notes');
      final value = {
        ...?note,
        'id': note?['id'] ?? store.newId(),
        'title': title.text.trim(),
        'body': body.text,
        'pinned': note?['pinned'] ?? false,
        'checklist': note?['checklist'] ?? false,
        'updatedAt': DateTime.now().millisecondsSinceEpoch,
      };
      rows.removeWhere((n) => n['id'] == value['id']);
      rows.insert(0, value);
      store.setRows('notes', rows);
    }
    await Future<void>.delayed(const Duration(milliseconds: 300));
    title.dispose();
    body.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rows = store.rows('notes');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        heading(
          'A place for your thoughts.',
          'Notes are saved on this device.',
        ),
        FilledButton.icon(
          onPressed: () => edit(context),
          icon: const Icon(Icons.add),
          label: const Text('New note'),
        ),
        const SizedBox(height: 16),
        Expanded(
          child: rows.isEmpty
              ? const Center(child: Text('Your next idea can start here.'))
              : ListView.builder(
                  itemCount: rows.length,
                  itemBuilder: (context, i) {
                    final note = rows[i];
                    return Card(
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        title: Text(
                          '${note['title']}'.isEmpty
                              ? 'Untitled note'
                              : '${note['title']}',
                        ),
                        subtitle: Text(
                          '${note['body']}',
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        onTap: () => edit(context, note),
                        trailing: IconButton(
                          tooltip: 'Delete note',
                          icon: const Icon(Icons.delete_outline),
                          onPressed: () {
                            final previous = store.rows('notes');
                            store.setRows(
                              'notes',
                              previous
                                  .where((n) => n['id'] != note['id'])
                                  .toList(),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: const Text('Note deleted.'),
                                action: SnackBarAction(
                                  label: 'Undo',
                                  onPressed: () =>
                                      store.setRows('notes', previous),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class TasksPage extends StatefulWidget {
  final WorkspaceStore store;
  const TasksPage({super.key, required this.store});
  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  final input = TextEditingController();
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  void add() {
    if (input.text.trim().isEmpty) return;
    widget.store.setRows('tasks', [
      ...widget.store.rows('tasks'),
      {
        'id': widget.store.newId(),
        'text': input.text.trim(),
        'done': false,
        'priority': 'medium',
        'due': '',
        'reminderAt': '',
        'notified': false,
        'createdAt': DateTime.now().millisecondsSinceEpoch,
      },
    ]);
    input.clear();
  }

  @override
  Widget build(BuildContext context) {
    final tasks = widget.store.rows('tasks');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        heading('One thing at a time.', 'Your tasks, without the noise.'),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: input,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Add a task',
                  counterText: '',
                ),
                onSubmitted: (_) => add(),
              ),
            ),
            const SizedBox(width: 12),
            IconButton.filled(
              tooltip: 'Add task',
              onPressed: add,
              icon: const Icon(Icons.add),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Expanded(
          child: tasks.isEmpty
              ? const Center(
                  child: Text('A clear list. A little breathing room.'),
                )
              : ListView.builder(
                  itemCount: tasks.length,
                  itemBuilder: (context, i) => Card(
                    child: CheckboxListTile(
                      value: tasks[i]['done'] == true,
                      onChanged: (v) {
                        tasks[i]['done'] = v;
                        widget.store.setRows('tasks', tasks);
                      },
                      title: Text(
                        '${tasks[i]['text']}',
                        style: TextStyle(
                          decoration: tasks[i]['done'] == true
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                      subtitle: '${tasks[i]['due'] ?? ''}'.isEmpty
                          ? null
                          : Text('${tasks[i]['due']}'),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

class CalculatorPage extends StatefulWidget {
  final WorkspaceStore store;
  const CalculatorPage({super.key, required this.store});
  @override
  State<CalculatorPage> createState() => _CalculatorPageState();
}

class _CalculatorPageState extends State<CalculatorPage> {
  final input = TextEditingController();
  String result = '', error = '';
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  void solve() {
    try {
      final n = calculate(input.text);
      final text = n.abs() < 1e15 && n == n.truncateToDouble()
          ? n.toInt().toString()
          : n.toStringAsPrecision(12).replaceFirst(RegExp(r'\.?0+$'), '');
      setState(() {
        result = text;
        error = '';
      });
      widget.store.setRows(
        'calculations',
        [
          {
            'id': widget.store.newId(),
            'expression': input.text,
            'result': text,
            'at': DateTime.now().millisecondsSinceEpoch,
          },
          ...widget.store.rows('calculations'),
        ].take(30).toList(),
      );
    } catch (e) {
      setState(() => error = 'Check your calculation and try again.');
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        heading(
          'A little number crunching.',
          'Keyboard-ready, with a local history.',
        ),
        TextField(
          controller: input,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Calculation',
            hintText: '(12 + 8) × 3',
          ),
          onSubmitted: (_) => solve(),
        ),
        SelectableText(result, style: const TextStyle(fontSize: 40)),
        if (error.isNotEmpty)
          Text(
            error,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final key in [
              '7',
              '8',
              '9',
              '÷',
              '4',
              '5',
              '6',
              '×',
              '1',
              '2',
              '3',
              '−',
              '0',
              '.',
              '%',
              '+',
              '(',
              ')',
              '^',
              'AC',
            ])
              SizedBox(
                width: 64,
                height: 48,
                child: FilledButton.tonal(
                  onPressed: () {
                    if (key == 'AC') {
                      input.clear();
                    } else {
                      input.text += key;
                    }
                  },
                  child: Text(key),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: solve, child: const Text('Calculate')),
        const SizedBox(height: 20),
        for (final row in widget.store.rows('calculations'))
          ListTile(
            title: Text('${row['expression']}'),
            trailing: SelectableText('${row['result']}'),
            onTap: () => setState(() => input.text = '${row['expression']}'),
          ),
      ],
    ),
  );
}

class FocusPage extends StatefulWidget {
  final WorkspaceStore store;
  const FocusPage({super.key, required this.store});
  @override
  State<FocusPage> createState() => _FocusPageState();
}

class _FocusPageState extends State<FocusPage> {
  Timer? ticker;
  Map<String, dynamic> get timer =>
      widget.store.data['timer'] as Map<String, dynamic>;
  int get remaining => timer['running'] == true && timer['endAt'] is num
      ? ((timer['endAt'] as num).toInt() -
                DateTime.now().millisecondsSinceEpoch)
            .clamp(0, 86400000)
      : (timer['remainingMs'] as num? ?? 1500000).toInt();
  @override
  void initState() {
    super.initState();
    ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (timer['running'] == true && remaining == 0) {
        timer['running'] = false;
        timer['remainingMs'] = timer['phase'] == 'work' ? 300000 : 1500000;
        timer['phase'] = timer['phase'] == 'work' ? 'break' : 'work';
        timer['endAt'] = null;
        widget.store.changed();
        notice(context, 'Session complete. Ready when you are.');
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final secs = (remaining / 1000).ceil();
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          heading(
            'Make a little room to focus.',
            'A quiet timer that keeps time across restarts.',
          ),
          const SizedBox(height: 30),
          Text(
            timer['phase'] == 'work' ? 'FOCUS' : 'TAKE A BREATHER',
            style: const TextStyle(letterSpacing: 2),
          ),
          const SizedBox(height: 24),
          Text(
            '${(secs ~/ 60).toString().padLeft(2, '0')}:${(secs % 60).toString().padLeft(2, '0')}',
            style: const TextStyle(fontSize: 76, fontWeight: FontWeight.w300),
          ),
          const SizedBox(height: 32),
          Wrap(
            spacing: 16,
            children: [
              FilledButton.icon(
                onPressed: () {
                  final ms = remaining;
                  timer['running'] = timer['running'] != true;
                  timer['remainingMs'] = ms;
                  timer['endAt'] = timer['running'] == true
                      ? DateTime.now().millisecondsSinceEpoch + ms
                      : null;
                  widget.store.changed();
                },
                icon: Icon(
                  timer['running'] == true ? Icons.pause : Icons.play_arrow,
                ),
                label: Text(timer['running'] == true ? 'Pause' : 'Start focus'),
              ),
              OutlinedButton(
                onPressed: () {
                  timer['running'] = false;
                  timer['endAt'] = null;
                  timer['remainingMs'] = timer['phase'] == 'work'
                      ? 1500000
                      : 300000;
                  widget.store.changed();
                },
                child: const Text('Reset'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ToolsPage extends StatefulWidget {
  const ToolsPage({super.key});
  @override
  State<ToolsPage> createState() => _ToolsPageState();
}

class _ToolsPageState extends State<ToolsPage> {
  final text = TextEditingController();
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        heading(
          'The little things, handled.',
          'Quick text tools, entirely on this device.',
        ),
        TextField(
          controller: text,
          maxLines: 8,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Your text'),
        ),
        const SizedBox(height: 12),
        Text(
          '${text.text.length} characters · ${text.text.trim().isEmpty ? 0 : text.text.trim().split(RegExp(r'\s+')).length} words',
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final name in ['UPPERCASE', 'lowercase', 'Clean spaces'])
              OutlinedButton(
                onPressed: () => setState(
                  () => text.text = name == 'UPPERCASE'
                      ? text.text.toUpperCase()
                      : name == 'lowercase'
                      ? text.text.toLowerCase()
                      : text.text.trim().replaceAll(RegExp(r'[ \t]+'), ' '),
                ),
                child: Text(name),
              ),
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: text.text));
                if (context.mounted) notice(context, 'Text copied.');
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copy'),
            ),
          ],
        ),
      ],
    ),
  );
}

class ShortcutsPage extends StatelessWidget {
  final WorkspaceStore store;
  const ShortcutsPage({super.key, required this.store});
  Future<void> add(BuildContext context) async {
    final name = TextEditingController(), url = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('New website shortcut'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: url,
              decoration: const InputDecoration(labelText: 'https://…'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (saved == true) {
      final uri = Uri.tryParse(url.text.trim());
      if (uri != null &&
          ['http', 'https'].contains(uri.scheme) &&
          uri.host.isNotEmpty) {
        store.setRows('shortcuts', [
          ...store.rows('shortcuts'),
          {
            'id': store.newId(),
            'name': name.text.trim().isEmpty ? uri.host : name.text.trim(),
            'target': uri.toString(),
            'kind': 'website',
          },
        ]);
      } else if (context.mounted) {
        notice(context, 'Enter a valid http or https website.');
      }
    }
    await Future<void>.delayed(const Duration(milliseconds: 300));
    name.dispose();
    url.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      heading('Your usual places.', 'Website shortcuts, one tap away.'),
      FilledButton.icon(
        onPressed: () => add(context),
        icon: const Icon(Icons.add),
        label: const Text('Add website'),
      ),
      const SizedBox(height: 16),
      Expanded(
        child: ListView(
          children: [
            for (final row in store.rows('shortcuts'))
              Card(
                child: ListTile(
                  leading: const Icon(Icons.open_in_new),
                  title: Text('${row['name']}'),
                  subtitle: Text(
                    '${row['target']}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () async {
                    final target = '${row['target']}';
                    final uri = Uri.tryParse(target);
                    try {
                      if (row['kind'] == 'website' &&
                          uri != null &&
                          ['http', 'https'].contains(uri.scheme)) {
                        if (Platform.isWindows) {
                          await Process.start('explorer.exe', [
                            target,
                          ], runInShell: false);
                        } else {
                          await const MethodChannel('islanddesk/platform')
                              .invokeMethod<void>('openUrl', {'url': target});
                        }
                      } else if (Platform.isWindows &&
                          (row['kind'] == 'app' || row['kind'] == 'folder')) {
                        await Process.start('explorer.exe', [
                          target,
                        ], runInShell: false);
                      } else {
                        if (context.mounted) {
                          notice(
                            context,
                            'This shortcut is available on the Windows desktop.',
                          );
                        }
                      }
                    } catch (_) {
                      if (context.mounted) {
                        notice(
                          context,
                          'Could not open this shortcut. Check its address.',
                        );
                      }
                    }
                  },
                ),
              ),
          ],
        ),
      ),
    ],
  );
}
