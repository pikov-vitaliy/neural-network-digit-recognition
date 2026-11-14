import argparse
import hashlib
import json
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'verification' / '2026-11-14'
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:4173/'
MODEL_KEY = 'ai-engineers-digit-lab-model-v1'
sys.stdout.reconfigure(encoding='utf-8')
manifest = json.loads((ROOT / 'public' / 'samples' / 'manifest.json').read_text(encoding='utf-8'))


def stored_model(page):
    return page.evaluate("key => localStorage.getItem(key)", MODEL_KEY)


def draw_digit(page):
    page.locator('#source-draw').click()
    box = page.locator('#drawing-canvas').bounding_box()
    def point(x, y):
        return box['x'] + box['width'] * x, box['y'] + box['height'] * y
    for points in [[(0.25, 0.2), (0.75, 0.2), (0.25, 0.2), (0.25, 0.5), (0.72, 0.5), (0.75, 0.75), (0.25, 0.8)]]:
        page.mouse.move(*point(*points[0]))
        page.mouse.down()
        for xy in points[1:]:
            page.mouse.move(*point(*xy), steps=5)
        page.mouse.up()
    expect(page.locator('#sample-name')).to_have_text('Собственный рисунок')


def canvas_hash(page):
    return page.locator('#drawing-canvas').evaluate('canvas => canvas.toDataURL()')


def input_and_probabilities(page):
    return page.evaluate('''() => ({
        pixels: Array.from(document.querySelector('#input-preview').getContext('2d').getImageData(0, 0, 16, 16).data).filter((_, i) => i % 4 === 2),
        probabilities: Array.from(document.querySelectorAll('#digit-outputs output'), output => Number.parseFloat(output.title))
    })''')


def choose_sample(page, sample_id):
    details = page.locator('#gallery-details')
    if details.count() and not details.evaluate('element => element.open'):
        details.locator('summary').click()
    page.locator(f'[data-id="{sample_id}"]').click()


def test_mapping(page):
    mismatches = []
    for class_id in range(10):
        model = page.evaluate('''classId => {
            const network = new window.__DigitNetwork();
            for (const layer of network.layers) { layer.weights.fill(0); layer.biases.fill(0); }
            network.layers.at(-1).biases[classId] = 12;
            return JSON.stringify(network.toJSON());
        }''', class_id)
        page.locator('#import-input').set_input_files(files=[{'name': f'class-{class_id}.json', 'mimeType': 'application/json', 'buffer': model.encode()}])
        expect(page.locator('#toast')).to_contain_text('Модель импортирована')
        page.evaluate('window.__canvasText = []')
        page.locator('#predict').click()
        digit = class_id
        row = (class_id - 1) % 10
        canvas_digits = page.evaluate('''() => {
            const byPosition = new Map();
            for (const item of window.__canvasText.filter(item => item.text.length === 1 && /\\d/.test(item.text) && item.x > item.width * 0.8 && Number.parseFloat(item.font) >= 10)) {
                if (byPosition.has(item.y) && byPosition.get(item.y) !== item.text) throw new Error('Conflicting labels at the same output position');
                byPosition.set(item.y, item.text);
            }
            return Array.from(byPosition.entries()).sort((a,b) => a[0] - b[0]).map(entry => entry[1]);
        }''')
        actual = {
            'prediction': page.locator('#predicted-digit').inner_text(),
            'winner': page.locator('#digit-outputs tr.winner').get_attribute('data-digit'),
            'inspector': page.locator('#inspection-title').inner_text(),
            'canvasDigit': canvas_digits[row] if row < len(canvas_digits) else None,
            'canvasDigits': canvas_digits,
        }
        model_before_click = stored_model(page)
        page.locator('#mode-recognition').click()
        page.locator(f'#network-output-{digit}').click()
        actual['overlayInspector'] = page.locator('#inspection-title').inner_text()
        actual['modelUnchanged'] = stored_model(page) == model_before_click
        if actual['prediction'] != str(digit) or actual['winner'] != str(digit) or f'цифра {digit}' not in actual['inspector'] or actual['canvasDigit'] != str(digit) or f'цифра {digit}' not in actual['overlayInspector'] or not actual['modelUnchanged']:
            mismatches.append({'classId': class_id, 'expectedDigit': digit, **actual})
    assert not mismatches, json.dumps(mismatches, ensure_ascii=False)
    page.screenshot(path=str(OUT / '01-output-mapping.png'), full_page=True)
    return {'classes': 10, 'mismatches': mismatches}


def test_stale_result(page):
    choose_sample(page, 'digit-0-00')
    page.locator('#predict').click()
    assert page.locator('#predicted-digit').inner_text() in list('0123456789')
    choose_sample(page, 'digit-1-00')
    expect(page.locator('#predicted-digit')).to_have_text('—')
    expect(page.locator('#digit-outputs tr.winner')).to_have_count(0)
    expect(page.locator('#feedback-correct')).to_be_disabled()
    draw_digit(page)
    expect(page.locator('#predicted-digit')).to_have_text('—')
    page.locator('#predict').click()
    page.locator('#file-input').set_input_files(str(ROOT / 'public' / 'samples' / 'digit-2-00.png'))
    expect(page.locator('#sample-name')).to_have_text('digit-2-00.png')
    expect(page.locator('#predicted-digit')).to_have_text('—')
    return {'inputChanges': ['gallery', 'drawing', 'upload'], 'cleared': True}


def test_same_png(page):
    rows = []
    for index, sample in enumerate(manifest['samples']):
        choose_sample(page, sample['id'])
        page.locator('#predict').click()
        gallery = input_and_probabilities(page)
        page.locator('#file-input').set_input_files(str(ROOT / 'public' / sample['file']))
        expect(page.locator('#sample-name')).to_have_text(Path(sample['file']).name)
        page.locator('#predict').click()
        upload = input_and_probabilities(page)
        pixel_delta = max(abs(a-b) for a,b in zip(gallery['pixels'], upload['pixels']))
        probability_delta = max(abs(a-b) for a,b in zip(gallery['probabilities'], upload['probabilities']))
        rows.append({'id': sample['id'], 'pixelDelta': pixel_delta, 'probabilityDeltaPercent': probability_delta})
        if (index + 1) % 20 == 0:
            print(f'PNG: {index + 1}/100', flush=True)
    assert len(rows) == 100
    assert all(row['pixelDelta'] == 0 and row['probabilityDeltaPercent'] <= 0.000001 for row in rows), [row for row in rows if row['pixelDelta'] or row['probabilityDeltaPercent'] > 0.000001][:5]
    (OUT / 'same-png-100.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'files': 100, 'maxPixelDelta': 0, 'tolerancePercent': 0.000001}


def test_feedback(page):
    draw_digit(page)
    page.locator('#predict').click()
    prediction = page.locator('#predicted-digit').inner_text()
    expect(page.locator('#feedback-correct')).to_contain_text(f'Верно, обучить на цифре {prediction}')
    drawing_before = canvas_hash(page)
    page.locator('#feedback-correct').evaluate('button => { button.click(); button.click(); }')
    expect(page.locator('#model-status')).to_contain_text('1 шаг')
    expect(page.locator('#training-feedback')).to_contain_text(f'Метка {prediction}')
    expect(page.locator('#training-feedback')).to_contain_text('Вероятность')
    expect(page.locator('#training-feedback')).to_contain_text('Вес')
    assert canvas_hash(page) == drawing_before
    assert json.loads(stored_model(page))['steps'] == 1
    page.locator('#predict').click()
    target = (int(prediction) + 1) % 10
    before = stored_model(page)
    page.locator(f'#network-output-{target}').click()
    expect(page.locator('#feedback-dialog')).to_be_visible()
    expect(page.locator('#feedback-title')).to_contain_text(f'Правильная цифра: {target}. Использовать для обучения?')
    assert stored_model(page) == before
    page.locator('#cancel-feedback').click()
    expect(page.locator('#feedback-dialog')).not_to_be_visible()
    assert stored_model(page) == before
    page.locator(f'#choose-output-{target}').focus()
    page.keyboard.press('Enter')
    expect(page.locator('#feedback-dialog')).to_be_visible()
    page.locator('#confirm-feedback').evaluate('button => { button.click(); button.click(); }')
    expect(page.locator('#feedback-dialog')).not_to_be_visible()
    assert json.loads(stored_model(page))['steps'] == 2
    expect(page.locator('#training-feedback')).to_contain_text(f'Метка {target}')
    assert canvas_hash(page) == drawing_before
    page.locator('#predict').click()
    page.locator(f'#choose-output-{target}').click()
    expect(page.locator('#feedback-dialog')).to_be_visible()
    page.locator('#file-input').set_input_files(str(ROOT / 'public' / 'samples' / 'digit-2-00.png'))
    expect(page.locator('#feedback-dialog')).not_to_be_visible()
    assert json.loads(stored_model(page))['steps'] == 2
    page.locator('#mode-recognition').click()
    page.locator(f'#choose-output-{target}').click()
    expect(page.locator('#feedback-dialog')).not_to_be_visible()
    expect(page.locator('#inspection-title')).to_contain_text(f'цифра {target}')
    assert json.loads(stored_model(page))['steps'] == 2
    page.screenshot(path=str(OUT / '02-feedback-after-training.png'), full_page=True)
    return {'correctSteps': 1, 'correctedSteps': 1, 'cancelSteps': 0, 'drawingPreserved': True, 'keyboard': True}


def test_recognition_and_validation(page):
    before = stored_model(page)
    page.locator('#mode-recognition').click()
    page.locator('#train-all').evaluate('button => button.click()')
    page.locator('#train-one').evaluate('button => button.click()')
    page.locator('#choose-output-7').click()
    page.locator('#neuron-picker').select_option('2:3')
    assert stored_model(page) == before
    expect(page.locator('#feedback-dialog')).not_to_be_visible()
    page.locator('#mode-training').click()
    page.evaluate('window.scheduler.yield = () => new Promise(resolve => setTimeout(resolve, 120));')
    page.locator('#train-all').click()
    expect(page.locator('#train-all')).to_be_disabled()
    page.locator('#mode-recognition').click()
    frozen = stored_model(page)
    page.wait_for_timeout(500)
    assert stored_model(page) == frozen
    assert json.loads(frozen)['steps'] < 960
    page.locator('#mode-training').click()
    page.locator('#gallery-details summary').click()
    page.locator('#dataset-filter').select_option('validation')
    choose_sample(page, 'digit-0-08')
    expect(page.locator('#train-one')).to_be_disabled()
    page.locator('#train-one').evaluate('button => button.click()')
    assert stored_model(page) == frozen
    expect(page.locator('#training-message')).to_contain_text('проверочн')
    return {'recognitionFrozen': True, 'cycleStopped': True, 'validationFrozen': True}


def test_import_and_reload(page):
    page.locator('#train-all').click()
    expect(page.locator('#train-all')).to_be_enabled(timeout=30000)
    expect(page.locator('#epoch-count')).to_have_text('12 / 12')
    metrics = page.locator('#loss-value').inner_text(), page.locator('#train-accuracy').inner_text(), page.locator('#validation-accuracy').inner_text()
    with page.expect_download() as info:
        page.locator('#export-model').click()
    exported = OUT / 'verified-model.json'
    info.value.save_as(str(exported))
    page.locator('#predict').click()
    probabilities = input_and_probabilities(page)['probabilities']
    page.locator('#import-input').set_input_files(str(exported))
    expect(page.locator('#toast')).to_contain_text('Модель импортирована')
    expect(page.locator('#predicted-digit')).to_have_text('—')
    page.locator('#predict').click()
    assert input_and_probabilities(page)['probabilities'] == probabilities
    before = stored_model(page)
    page.locator('#import-input').set_input_files(str(ROOT / 'docs' / 'audits' / 'codex' / '2026-11-14-full-audit' / 'evidence' / 'math' / 'finite-overflow-model.json'))
    expect(page.locator('#toast')).to_contain_text('Не удалось импортировать')
    assert stored_model(page) == before
    assert 'NaN' not in page.locator('body').inner_text()
    assert 'Infinity' not in page.locator('body').inner_text()
    page.reload(wait_until='networkidle')
    expect(page.locator('#sample-grid button')).to_have_count(100)
    assert metrics == (page.locator('#loss-value').inner_text(), page.locator('#train-accuracy').inner_text(), page.locator('#validation-accuracy').inner_text())
    expect(page.locator('#model-status')).to_contain_text('960')
    expect(page.locator('#epoch-label')).to_contain_text('восстановлен')
    assert json.loads(stored_model(page))['steps'] == 960
    return {'reloadMetrics': metrics, 'importPreservesProbabilities': True, 'overflowRejected': True}


def test_input_errors(page):
    page.locator('#source-draw').click()
    page.locator('#clear-drawing').click()
    page.locator('#predict').click()
    expect(page.locator('#toast')).to_contain_text('Сначала нарисуйте цифру')
    expect(page.locator('#predicted-digit')).to_have_text('—')
    page.locator('#file-input').set_input_files(files=[{'name': 'broken.png', 'mimeType': 'image/png', 'buffer': b'not a PNG'}])
    expect(page.locator('#toast')).to_contain_text('Не удалось прочитать изображение')
    assert 'could not be decoded' not in page.locator('#toast').inner_text()
    return {'emptyRejected': True, 'decodeErrorRussian': True}


def main():
    parser = argparse.ArgumentParser(description='Проверка Digit Lab после аудита')
    parser.add_argument('--stage', choices=['state'], default='state')
    parser.add_argument('--only', help='Подстрока имени группы для отдельной диагностики')
    args = parser.parse_args()
    tests = [('AUD-01 mapping', test_mapping), ('AUD-02 stale result', test_stale_result), ('AUD-03 100 PNG', test_same_png), ('R-01 feedback', test_feedback), ('AUD-04/05 recognition', test_recognition_and_validation), ('AUD-08/10 import/reload', test_import_and_reload), ('input errors', test_input_errors)]
    if args.only:
        tests = [item for item in tests if args.only.lower() in item[0].lower()]
    assert tests, 'Нет тестовой группы с таким именем'
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        for name, function in tests:
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
            page = context.new_page()
            page.set_default_timeout(9000)
            errors = []
            page.on('pageerror', lambda error, errors=errors: errors.append(str(error)))
            page.add_init_script('''(() => {
                window.__canvasText = [];
                window.__clickLog = [];
                document.addEventListener('click', event => window.__clickLog.push(event.target.id || event.target.tagName));
                const original = CanvasRenderingContext2D.prototype.fillText;
                CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
                    if (this.canvas.id === 'network-canvas') window.__canvasText.push({text: String(text), x, y, width: this.canvas.clientWidth, font: this.font});
                    return original.call(this, text, x, y, ...rest);
                };
            })();''')
            try:
                page.goto(URL, wait_until='networkidle')
                page.evaluate('''async () => {
                    const [{ DigitNetwork }, { NetworkView }] = await Promise.all([import('/shared/neural-network.js'), import('/js/network-view.js')]);
                    window.__DigitNetwork = DigitNetwork;
                    window.__selectLog = [];
                    const select = NetworkView.prototype.select;
                    NetworkView.prototype.select = function(layer, index) {
                        const result = select.call(this, layer, index);
                        window.__selectLog.push({layer, index, hasResult: Boolean(this.result), title: document.querySelector('#inspection-title').textContent});
                        return result;
                    };
                }''')
                expect(page.locator('#sample-grid button')).to_have_count(100)
                evidence = function(page)
                assert not errors, errors
                results.append({'name': name, 'status': 'PASS', 'evidence': evidence})
                print(f'PASS {name}', flush=True)
            except Exception as error:
                results.append({'name': name, 'status': 'FAIL', 'error': str(error), 'errors': errors, 'clicks': page.evaluate('window.__clickLog || []'), 'selections': page.evaluate('window.__selectLog || []')})
                print(f'FAIL {name}: {str(error)[:700]}', flush=True)
                print('Clicks:', page.evaluate('window.__clickLog || []'), 'Selections:', page.evaluate('window.__selectLog || []'), flush=True)
                print('State:', page.evaluate("({toast:document.querySelector('#toast').textContent, mode:document.querySelector('#mode-recognition').getAttribute('aria-pressed'), disabled:document.querySelector('#choose-output-5').disabled})"), flush=True)
                page.screenshot(path=str(OUT / ('failure-' + hashlib.sha256(name.encode()).hexdigest()[:8] + '.png')), full_page=True)
            finally:
                context.close()
        browser.close()
    (OUT / 'state-results.json').write_text(json.dumps({'url': URL, 'stage': args.stage, 'results': results}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'passed': sum(row['status'] == 'PASS' for row in results), 'failed': sum(row['status'] == 'FAIL' for row in results)}, ensure_ascii=False))
    if any(row['status'] == 'FAIL' for row in results):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
