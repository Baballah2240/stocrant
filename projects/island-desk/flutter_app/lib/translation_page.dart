import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'translation_service.dart';

class TranslationPage extends StatefulWidget {
  const TranslationPage({super.key});
  @override
  State<TranslationPage> createState() => _TranslationPageState();
}

class _TranslationPageState extends State<TranslationPage> {
  final source = TextEditingController(), output = TextEditingController();
  final service = TranslationService();
  bool arabic = false, busy = false;
  String? error;
  int sequence = 0;
  @override
  void dispose() {
    service.cancel();
    source.dispose();
    output.dispose();
    super.dispose();
  }

  void cancel() {
    sequence++;
    service.cancel();
    setState(() => busy = false);
  }

  void change() {
    if (busy) cancel();
    setState(() {
      output.clear();
      error = null;
    });
  }

  void swap() {
    if (busy) cancel();
    setState(() {
      arabic = !arabic;
      if (output.text.isNotEmpty) source.text = output.text;
      output.clear();
      error = null;
    });
  }

  Future<void> translate() async {
    if (busy || source.text.trim().isEmpty || source.text.length > 3000) return;
    final id = ++sequence;
    setState(() {
      busy = true;
      error = null;
      output.clear();
    });
    try {
      final text = await service.translate(
        source.text,
        arabic ? 'ar' : 'en',
        arabic ? 'en' : 'ar',
      );
      if (mounted && id == sequence) setState(() => output.text = text);
    } catch (e) {
      if (mounted && id == sequence) setState(() => error = e.toString());
    } finally {
      if (mounted && id == sequence) setState(() => busy = false);
    }
  }

  Widget panel(bool result) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                result ? 'Translation' : 'Your text',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Text(
                result
                    ? (arabic ? 'English' : 'العربية')
                    : (arabic ? 'العربية' : 'English'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            key: Key(result ? 'translation-output' : 'translation-source'),
            controller: result ? output : source,
            readOnly: result,
            maxLines: 6,
            minLines: 6,
            textDirection: (result ? !arabic : arabic)
                ? TextDirection.rtl
                : TextDirection.ltr,
            style: const TextStyle(fontSize: 17, height: 1.65),
            decoration: InputDecoration(
              hintText: result
                  ? (busy
                        ? 'Translating…'
                        : 'Your translation will appear here.')
                  : 'Type or paste text…',
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              filled: false,
              contentPadding: EdgeInsets.zero,
            ),
            onChanged: result ? null : (_) => change(),
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  result
                      ? (busy
                            ? 'Translating…'
                            : output.text.isEmpty
                            ? ''
                            : 'Ready to copy')
                      : '${source.text.length} / 3,000',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xffb0b1bc),
                  ),
                ),
              ),
              if (result)
                TextButton.icon(
                  onPressed: output.text.isEmpty || busy
                      ? null
                      : () async {
                          try {
                            await Clipboard.setData(
                              ClipboardData(text: output.text),
                            );
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Translation copied.'),
                                ),
                              );
                            }
                          } catch (_) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Could not copy. Select the text and copy manually.',
                                  ),
                                ),
                              );
                            }
                          }
                        },
                  icon: const Icon(Icons.copy_rounded, size: 18),
                  label: const Text('Copy'),
                )
              else
                TextButton(
                  onPressed: source.text.isEmpty
                      ? null
                      : () {
                          source.clear();
                          change();
                        },
                  child: const Text('Clear'),
                ),
            ],
          ),
        ],
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, size) => Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Find the right words.',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Arabic ↔ English translation, a little closer to hand.',
                  style: TextStyle(color: Color(0xffb0b1bc), height: 1.5),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        arabic ? 'العربية / Arabic' : 'English',
                        textAlign: TextAlign.center,
                      ),
                    ),
                    IconButton.filledTonal(
                      tooltip: 'Swap languages',
                      onPressed: swap,
                      icon: const Icon(Icons.swap_horiz_rounded),
                    ),
                    Expanded(
                      child: Text(
                        arabic ? 'English' : 'العربية / Arabic',
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                if (size.maxWidth >= 600)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: panel(false)),
                      const SizedBox(width: 16),
                      Expanded(child: panel(true)),
                    ],
                  )
                else ...[
                  panel(false),
                  const SizedBox(height: 16),
                  panel(true),
                ],
                const SizedBox(height: 16),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ),
                if (source.text.length > 3000)
                  const Text('Shorten your text to 3,000 characters.'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 12,
              runSpacing: 12,
              children: [
                if (busy)
                  TextButton(onPressed: cancel, child: const Text('Cancel')),
                FilledButton.icon(
                  onPressed:
                      busy ||
                          source.text.trim().isEmpty ||
                          source.text.length > 3000
                      ? null
                      : translate,
                  icon: busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.translate_rounded),
                  label: Text(
                    busy
                        ? 'Translating…'
                        : error == null
                        ? 'Translate'
                        : 'Try again',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Text is sent to MyMemory only when you translate. Internet required; free daily limits apply. Translation drafts are not saved.',
              style: TextStyle(
                fontSize: 12,
                color: Color(0xffb0b1bc),
                height: 1.6,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}
