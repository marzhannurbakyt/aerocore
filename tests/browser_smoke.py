"""Browser integration checks. Optional: pip install -r tests/requirements.txt."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import argparse
import json
import os
import shutil
import tempfile

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args()
    output = args.output_dir or Path(tempfile.mkdtemp(prefix='aerocore-browser-'))
    output.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'docs')))
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/'
    errors, external = [], []
    try:
        with sync_playwright() as p:
            executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
            browser = p.chromium.launch(**({'executable_path': executable} if executable else {}), headless=True, args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1050}, accept_downloads=True)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: external.append(request.url) if request.url.startswith('http') and not request.url.startswith(url) else None)
            page.goto(url)
            expect(page.locator('.status .pct')).to_have_text('65%')
            page.locator('#reveal').click()
            expect(page.locator('.reveal')).to_contain_text('Full (maximal) test result')
            page.screenshot(path=str(output / '01-workspace.png'), full_page=True)

            # Every replay participant and time point must render finite SVG geometry.
            participants = page.locator('#who option').all_text_contents()
            checks = 0
            for participant in participants:
                page.locator('#who').select_option(participant)
                for key in page.locator('[data-tk]').evaluate_all('(els)=>els.map(el=>el.dataset.tk)'):
                    page.locator(f'[data-tk="{key}"]').click()
                    assert not page.locator('#me-main svg').evaluate_all('(els)=>els.some(el=>/NaN|Infinity/.test(el.outerHTML))')
                    checks += 1
            page.locator('#who').select_option('C3D_7961')

            page.locator('#ev').click()
            expect(page.locator('#modal')).to_have_class('modal on')
            expect(page.locator('#modal .content')).to_contain_text('20,000')
            page.screenshot(path=str(output / '02-evidence.png'), full_page=True)
            page.keyboard.press('Escape')
            page.locator('#uc').click()
            expect(page.locator('#modal .content')).to_contain_text('Mission concept')
            page.keyboard.press('Escape')

            page.locator('[data-mode="own"]').click()
            def change(selector, value):
                page.locator(selector).fill(value)
                page.locator(selector).dispatch_event('change')
            def percent():
                return page.locator('.status .pct').inner_text()
            initial = percent()
            change('#own-base', '1000000000')
            assert percent() == '—'
            expect(page.locator('#save')).to_be_disabled()
            change('#own-base', '3')
            change('[data-i="0"][data-k="hr"]', '')
            expect(page.locator('[data-i="0"][data-k="hr"]')).to_have_value('')
            expect(page.locator('#save')).to_be_disabled()
            change('[data-i="0"][data-k="hr"]', '108')
            for i in range(3): change(f'[data-i="{i}"][data-k="vo2"]', '1.5')
            assert percent() == '—'
            for i, value in enumerate(['1.15', '1.65', '2.15']): change(f'[data-i="{i}"][data-k="vo2"]', value)
            change('#own-full', '1000000')
            expect(page.locator('.reveal')).to_contain_text('must be within')
            change('#own-full', '2.5')
            page.locator('#save').click()
            assert percent() == initial
            change('#own-base', '4')
            assert percent() == initial, 'historical baseline changed'
            page.reload()
            page.locator('[data-mode="own"]').click()
            page.locator('[data-tk="c1"]').click()
            assert percent() == initial, 'history did not survive reload'
            assert page.locator('[data-i="0"][data-k="hr"]').get_attribute('readonly') is not None
            page.locator('#share').click()
            expect(page.locator('#share-txt')).to_contain_text('3.00 L/min pre-flight')
            assert page.locator('#modal .close').evaluate('(el)=>document.activeElement===el')
            page.keyboard.press('Shift+Tab')
            assert page.locator('#download-report').evaluate('(el)=>document.activeElement===el')
            with page.expect_download() as saved:
                page.locator('#download-report').click()
            saved.value.save_as(str(output / 'sample-check.txt'))
            assert '3.00 L/min pre-flight' in (output / 'sample-check.txt').read_text()
            page.keyboard.press('Escape')
            expect(page.locator('#share')).to_be_focused()

            page.locator('[data-v="crew"]').click()
            page.locator('tr.row').first.focus()
            page.keyboard.press('Enter')
            expect(page.locator('[data-mode="nasa"]')).to_have_attribute('aria-pressed', 'true')
            page.locator('[data-v="crew"]').click()
            page.screenshot(path=str(output / '03-cohort.png'), full_page=True)
            page.locator('#ds-sel').select_option('cft70')
            for group in ['Control', 'Exercise', 'Flywheel', 'All']:
                page.locator(f'[data-g="{group}"]').click()
                assert page.locator('#crew tr.row').count() > 0
            page.locator('#only').check()
            page.locator('#issues-btn').click()
            expect(page.locator('#modal .content')).to_contain_text('Raw archive files are not bundled')
            page.keyboard.press('Escape')
            page.locator('#up').click()
            page.locator('#file').set_input_files({'name': 'broken.csv', 'mimeType': 'text/csv', 'buffer': b'participant_id,test_type,study_day,vo2_lmin\nDEMO,Peak,-7,"3\n'})
            expect(page.locator('#upload-status')).to_contain_text('Unable to load data')
            page.keyboard.press('Escape')
            page.locator('#up').click()
            csv = b'participant_id,test_type,study_day,heart_rate,vo2_lmin,rer,age,posture\nDEMO,Peak,-7,185,3.0,1.15,30,upright\nDEMO,Peak,-3,186,3.02,1.16,30,upright\nDEMO,Peak,30,184,2.35,1.15,30,upright\n'
            page.locator('#file').set_input_files({'name': 'valid.csv', 'mimeType': 'text/csv', 'buffer': csv})
            expect(page.locator('#ds-sel')).to_have_value('user')
            expect(page.locator('#crew')).to_contain_text('DEMO')
            page.locator('#crew tr.row').first.click()
            expect(page.locator('#modal .content')).to_contain_text('Baseline measured peak')
            page.keyboard.press('Escape')

            # The self-contained UI must not depend on internet access.
            page.route('**/*', lambda route: route.abort() if not route.request.url.startswith(url) else route.continue_())
            for width in [1440, 1024, 768, 390, 360]:
                page.set_viewport_size({'width': width, 'height': 950})
                page.locator('[data-v="me"]').click()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), f'me overflow at {width}'
                if width == 390: page.screenshot(path=str(output / '04-mobile.png'), full_page=True)
                page.locator('[data-v="crew"]').click()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), f'crew overflow at {width}'
            assert not errors, errors
            assert not external, external
            result = {'status': 'passed', 'replay_participants': len(participants), 'replay_checks': checks, 'viewport_widths': [1440, 1024, 768, 390, 360], 'page_errors': errors, 'external_requests': external, 'tested': ['known replay and reveal', 'all replay charts', 'evidence and context dialogs', 'invalid and blank input', 'degenerate regression', 'saved reference snapshots and reload', 'readonly history', 'TXT download', 'modal focus and Escape', 'keyboard cohort navigation', 'all CFT70 group filters', 'malformed CSV error', 'valid CSV import', 'responsive layout', 'no external network dependencies']}
            (output / 'browser-results.json').write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))
            browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
