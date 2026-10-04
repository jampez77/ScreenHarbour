import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Optional actual-theme integration: point this at ElegantFin's published CSS.
// Keep the third-party source outside the repository.
const elegantSource = process.env.TVL_ELEGANTFIN_CSS || '/tmp/cinema-elegantfin-theme.css';
const elegantCss = existsSync(elegantSource) ? readFileSync(elegantSource, 'utf8') : '';

async function setup(page: Page, route: string, admin = false, layout: 'tv' | 'desktop' | 'mobile' = 'tv') {
  if (layout !== 'tv') await page.addInitScript(layout => document.addEventListener('DOMContentLoaded', () => document.body.classList.replace('layout-tv', `layout-${layout}`)), layout);
  await page.goto('/#/' + route);
  await page.evaluate(admin => {
    document.querySelector('.demo-native-page')?.classList.add('hide');
    const state = { admin, user: 'demo', server: 'demo-server', reads: [] as string[], cachedReads: 0, routes: [] as string[], saves: 0, signouts: 0, query: '', deferred: false };
    (window as any).__userPageState = state;
    (window as any).ApiClient = {
      getCurrentUserId: () => state.user, serverId: () => state.server,
      getCurrentUser: async () => { state.cachedReads++; return { Id: state.user, Policy: { IsAdministrator: true } }; },
      getUser: async (id: string) => {
        state.reads.push(id);
        const response = { Id: state.user, Policy: { IsAdministrator: state.admin } };
        if (state.deferred) await new Promise<void>(resolve => { (window as any).__resolveUserPolicy = resolve; });
        return response;
      }
    };
    (window as any).Dashboard = { navigate: (route: string) => { state.routes.push(route); location.hash = '/' + route; } };
    const style = document.createElement('style');
    // The base selectors mirror native/ElegantFin styling while Cinema owns
    // only its scoped overrides. Hidden controls must remain hidden.
    style.textContent = '.hide{display:none!important}.test-native-page{padding-top:100px;min-height:650px}.userPreferencesPage,#searchPage{background:#07172c;color:#aaccee}.readOnlyContent{max-width:54em}.verticalSection{margin-bottom:1em}.sectionTitle{font-size:1.5em}.listItem{display:flex;align-items:center;padding:.4em}.listItemIcon{display:block;width:2em;height:2em}.listItemBody{flex:1}.listItem-border{display:block;padding:0;margin:0}.emby-button{color:#aaccee}.searchFieldsInner{display:flex}.inputContainer{flex:1}.alphaPickerRow{display:flex;justify-content:center}.alphaPickerButton{outline:none!important}.itemsContainer{display:flex}.card{width:180px;border:0;background:transparent;color:inherit;padding:.4em}.cardImageContainer{height:230px;background:#354d40}.cardText{background:#123456;padding:.4em}.searchSuggestionsList{text-align:center}.emby-input{background:#07172c;color:#aaccee}.emby-select{background:#07172c;color:#aaccee}';
    document.head.append(style); window.TvItemLayout!.refresh();
  }, admin);
}

async function settingsMarkup(page: Page) {
  await page.evaluate(() => {
    // Replace the minimal demo Settings page with the audited native structure.
    // Keeping both would duplicate its ID and attach links to the wrong fixture.
    document.querySelector('#myPreferencesMenuPage')?.remove();
    const page = document.createElement('main'); page.id = 'myPreferencesMenuPage';
    page.className = 'page libraryPage userPreferencesPage noSecondaryNavPage mainAnimatedPage test-native-page';
    const entry = (label: string, className: string, href: string) => `<a class="emby-button show-focus ${className} listItem-border" href="${href}" style="display:block;margin:0;padding:0"><div class="listItem"><span class="material-icons listItemIcon listItemIcon-transparent" aria-hidden="true"></span><div class="listItemBody"><div class="listItemBodyText">${label}</div></div></div></a>`;
    page.innerHTML = `<div class="padded-left padded-right padded-bottom-page padded-top"><div class="readOnlyContent" style="margin:0 auto"><div class="verticalSection verticalSection-extrabottompadding"><h2 class="sectionTitle headerUsername" style="padding-left:.25em">Family</h2>${entry('Profile','lnkUserProfile','#/userprofile?userId=demo')}${entry('Display','lnkDisplayPreferences','#/mypreferencesdisplay?userId=demo')}${entry('Home','lnkHomePreferences','#/mypreferenceshome?userId=demo')}${entry('Playback','lnkPlaybackPreferences','#/mypreferencesplayback?userId=demo')}${entry('Subtitles','lnkSubtitlePreferences','#/mypreferencessubtitles?userId=demo')}${entry('Controls','lnkControlsPreferences','#/mypreferencescontrols?userId=demo')}${entry('Hidden option','hide','#/unavailable')}</div><div class="userSection verticalSection verticalSection-extrabottompadding"><h2 class="sectionTitle headerUsername">User</h2>${entry('Sign out','btnLogout','#')}</div></div></div>`;
    page.querySelector('.btnLogout')!.addEventListener('click', event => { event.preventDefault(); (window as any).__userPageState.signouts++; });
    document.body.append(page); (window as any).__nativeSettingsPage = page;
  });
}

async function searchMarkup(page: Page) {
  await page.evaluate(() => {
    const page = document.createElement('main'); page.id = 'searchPage';
    page.className = 'page mainAnimatedPage libraryPage allLibraryPage noSecondaryNavPage test-native-page';
    const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => `<button data-value="${letter}" class="alphaPickerButton alphaPickerButton-tv">${letter}</button>`).join('');
    page.innerHTML = `<div class="padded-left padded-right searchFields"><div class="searchFieldsInner flex align-items-center justify-content-center"><span class="searchfields-icon material-icons search" aria-hidden="true"></span><div class="inputContainer flex-grow" style="margin-bottom:0"><input id="searchTextInput" class="emby-input searchfields-txtSearch" type="text" data-keyboard="true" placeholder="Search" aria-label="Search" autocomplete="off" maxlength="40"></div></div><div class="alphaPicker align-items-center alphaPicker-tv focuscontainer-x focusable"><div class="alphaPickerRow"><button data-value=" " class="alphaPickerButton alphaPickerButton-tv" aria-label="Space">_</button>${letters}<button data-value="backspace" class="alphaPickerButton alphaPickerButton-tv" aria-label="Backspace">←</button></div><div class="alphaPickerRow"><br><button data-value="0" class="alphaPickerButton alphaPickerButton-tv">0</button><button data-value="1" class="alphaPickerButton alphaPickerButton-tv">1</button></div></div></div><div class="verticalSection searchSuggestions" style="text-align:center"><div><h2 class="sectionTitle padded-left padded-right">Suggestions</h2></div><div class="searchSuggestionsList padded-left padded-right"><div><a class="emby-button button-link" style="display:inline-block;padding:.5em 1em" href="#/details?id=movie-tide">After the Tide</a></div><div><a class="emby-button button-link" style="display:inline-block;padding:.5em 1em" href="#/details?id=movie-blue">A Kind of Blue</a></div></div></div><div class="searchResults padded-top padded-bottom-page"><div class="verticalSection"><h2 class="sectionTitle sectionTitle-cards focuscontainer-x padded-left padded-right">Movies</h2><div is="emby-scroller" data-horizontal="true" data-centerfocus="card" class="padded-top-focusscale padded-bottom-focusscale"><div is="emby-itemscontainer" class="focuscontainer-x itemsContainer scrollSlider"><button class="card" aria-label="After the Tide result"><div class="cardBox"><div class="cardScalable"><div class="cardImageContainer"></div></div><div class="cardText">After the Tide</div><div class="cardText cardText-secondary">2025</div></div></button></div></div></div></div>`;
    const input = page.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('input', () => { (window as any).__userPageState.query = input.value; });
    // Jellyfin 12 SearchFields.tsx renders the alphabet only in TV mode.
    // Keep native desktop structure instead of adding TV-only controls to it.
    if (!document.body.classList.contains('layout-tv') && !document.documentElement.classList.contains('layout-tv')) page.querySelector('.alphaPicker')!.remove();
    page.querySelector('.alphaPicker')?.addEventListener('click', event => {
      const value = (event.target as HTMLElement).closest<HTMLElement>('[data-value]')?.dataset.value;
      if (value === undefined) return;
      input.value = value === 'backspace' ? input.value.slice(0, -1) : input.value + value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    page.querySelector('.card')!.addEventListener('click', () => { location.hash = '/details?id=movie-tide'; });
    document.body.append(page); (window as any).__nativeSearchInput = input;
  });
}

test('TV Search themes native input, alphabet, suggestions and result cards without taking over their actions', async ({ page }) => {
  await setup(page, 'search'); await searchMarkup(page);
  const search = page.locator('#searchPage');
  await expect(search).toHaveCSS('background-color', 'rgb(16, 17, 18)');
  await expect(search.locator('.cardText').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(search.locator('.searchSuggestionsList')).toHaveCSS('display', 'grid');
  const input = search.getByRole('textbox', { name: 'Search', exact: true });
  await input.fill('Tides'); await input.press('Backspace');
  await search.getByRole('button', { name: 'A', exact: true }).focus(); await page.keyboard.press('Enter');
  expect(await page.evaluate(() => (window as any).__userPageState.query)).toBe('TideA');
  expect(await input.evaluate(node => node === (window as any).__nativeSearchInput)).toBe(true);
  await page.screenshot({ path: '/tmp/jellyfin-cinema-search.png' });
  await search.getByRole('button', { name: 'After the Tide result', exact: true }).click();
  await expect(page).toHaveURL(/#\/details\?id=movie-tide$/);
  await expect(page.locator('body')).not.toHaveClass(/tvl-native-search/);
});

test('TV Settings retains native links, sign-out and hidden controls; admin Dashboard appears after a fresh policy read', async ({ page }) => {
  await setup(page, 'mypreferencesmenu', true); await settingsMarkup(page);
  const settings = page.locator('#myPreferencesMenuPage');
  const dashboard = settings.getByRole('link', { name: 'Dashboard', exact: true });
  await expect(dashboard).toBeVisible(); await expect(settings.locator('.readOnlyContent')).toHaveCSS('display', 'grid');
  await expect(settings.getByRole('link', { name: 'Hidden option', exact: true })).toBeHidden();
  await settings.getByRole('link', { name: 'Sign out', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__userPageState.signouts)).toBe(1);
  expect(await settings.evaluate(node => node === (window as any).__nativeSettingsPage)).toBe(true);
  await page.screenshot({ path: '/tmp/jellyfin-cinema-settings.png' });
  const before = await page.evaluate(() => (window as any).__userPageState.reads.length);
  await dashboard.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/dashboard$/);
  expect(await page.evaluate(() => (window as any).__userPageState.routes)).toEqual(['dashboard']);
  expect(await page.evaluate(() => (window as any).__userPageState.reads.length)).toBe(before + 1);
  expect(await page.evaluate(() => (window as any).__userPageState.reads.every((value: string) => value === 'demo'))).toBe(true);
  expect(await page.evaluate(() => (window as any).__userPageState.cachedReads)).toBe(0);
});

test('non-admin, failed policy and editing another profile never expose an admin link', async ({ page }) => {
  await setup(page, 'mypreferencesmenu?userId=someone-else', true); await settingsMarkup(page);
  const dashboard = page.locator('.tvl-settings-dashboard');
  await expect(dashboard).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__userPageState.reads)).toEqual([]);
  await page.evaluate(() => { (window as any).__userPageState.admin = false; location.hash = '/mypreferencesmenu'; });
  await expect.poll(() => page.evaluate(() => (window as any).__userPageState.reads.length)).toBeGreaterThan(0);
  await expect(dashboard).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).ApiClient.getUser = async () => { throw new Error('offline'); };
    document.querySelector('#myPreferencesMenuPage')!.dispatchEvent(new Event('viewshow', { bubbles: true }));
  });
  await expect(dashboard).toHaveCount(0);
});

test('a pending admin response cannot cross accounts and a revoked policy cannot activate the old link', async ({ page }) => {
  await setup(page, 'home', true);
  await page.evaluate(() => { (window as any).__userPageState.deferred = true; location.hash = '/mypreferencesmenu'; });
  await settingsMarkup(page);
  await expect.poll(() => page.evaluate(() => typeof (window as any).__resolveUserPolicy)).toBe('function');
  await page.evaluate(() => {
    const state = (window as any).__userPageState; state.user = 'child'; state.admin = false; state.deferred = false;
    window.TvItemLayoutDemo!.api = { ...window.TvItemLayoutDemo!.api, userId: 'child' };
    window.TvItemLayout!.refresh(); (window as any).__resolveUserPolicy();
  });
  await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__userPageState.admin = true; document.querySelector('#myPreferencesMenuPage')!.dispatchEvent(new Event('viewshow', { bubbles: true })); });
  const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true }); await expect(dashboard).toBeVisible();
  await page.evaluate(() => { (window as any).__userPageState.admin = false; });
  await dashboard.click(); await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__userPageState.routes)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__userPageState.cachedReads)).toBe(0);
});

test('native preference form controls retain submit behavior and Cinema styling does not leak to mobile', async ({ page }) => {
  await setup(page, 'mypreferencesdisplay?userId=demo');
  await page.evaluate(() => {
    const page = document.createElement('main'); page.id = 'displayPreferencesPage'; page.className = 'page libraryPage userPreferencesPage noSecondaryNavPage test-native-page';
    page.innerHTML = '<div class="settingsContainer padded-left padded-right padded-bottom-page"><form><label for="selectLayout">Layout</label><select id="selectLayout" class="emby-select"><option>TV</option><option>Desktop</option></select><button type="submit" class="raised button-submit">Save</button><button class="hide">Unavailable setting</button></form></div>';
    page.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); (window as any).__userPageState.saves++; }); document.body.append(page);
  });
  await expect(page.locator('#displayPreferencesPage')).toHaveCSS('background-color', 'rgb(16, 17, 18)');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); expect(await page.evaluate(() => (window as any).__userPageState.saves)).toBe(1);
  await expect(page.getByRole('button', { name: 'Unavailable setting', exact: true })).toBeHidden();
  await page.evaluate(() => { document.body.classList.replace('layout-tv', 'layout-mobile'); });
  await expect(page.locator('body')).not.toHaveClass(/tvl-native-settings/);
  await expect(page.locator('#displayPreferencesPage')).toHaveCSS('background-color', 'rgb(7, 23, 44)');
});

test('mobile Search and Settings remain native, and destroying desktop Cinema releases the owned link', async ({ page }) => {
  await setup(page, 'search', true, 'mobile'); await searchMarkup(page);
  await expect(page.locator('#searchPage')).toHaveCSS('background-color', 'rgb(7, 23, 44)');
  await page.evaluate(() => { location.hash = '/mypreferencesmenu'; }); await settingsMarkup(page);
  await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(0);
  await expect(page.locator('#myPreferencesMenuPage .readOnlyContent')).not.toHaveCSS('display', 'grid');
  await page.evaluate(() => { document.body.classList.replace('layout-mobile', 'layout-desktop'); });
  await expect(page.locator('.tvl-settings-dashboard')).toBeVisible();
  await page.evaluate(() => window.TvItemLayout!.destroy());
  await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(0);
  await expect(page.locator('#myPreferencesMenuPage')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/tvl-native-settings|tvl-native-search/);
});

test('desktop Search keeps native text editing and result actions; Settings retains links and fresh admin checks', async ({ page }) => {
  await setup(page, 'search', true, 'desktop'); await searchMarkup(page);
  await expect(page.locator('.layout-tv')).toHaveCount(0);
  const search = page.locator('#searchPage');
  await expect(search).toHaveCSS('background-color', 'rgb(16, 17, 18)');
  await expect(search.locator('.alphaPicker')).toHaveCount(0);
  const input = search.getByRole('textbox', { name: 'Search', exact: true });
  await input.click(); await input.fill('Tide'); await input.press('ArrowLeft');
  expect(await input.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe(3);
  await input.press('Backspace');
  expect(await page.evaluate(() => (window as any).__userPageState.query)).toBe('Tie');
  await expect(input).toHaveCSS('outline-style', 'solid');
  expect(await input.evaluate(node => node === (window as any).__nativeSearchInput)).toBe(true);
  await search.getByRole('button', { name: 'After the Tide result', exact: true }).click();
  await expect(page).toHaveURL(/#\/details\?id=movie-tide$/);
  await expect(page.locator('body')).not.toHaveClass(/tvl-native-search/);
  await page.evaluate(() => { document.querySelector('#searchPage')!.classList.add('hide'); location.hash = '/mypreferencesmenu'; });
  await settingsMarkup(page);
  const settings = page.locator('#myPreferencesMenuPage');
  await expect(settings.locator('.readOnlyContent')).toHaveCSS('display', 'grid');
  await expect(settings.getByRole('link', { name: 'Hidden option', exact: true })).toBeHidden();
  const dashboard = settings.getByRole('link', { name: 'Dashboard', exact: true });
  await expect(dashboard).toBeVisible(); await dashboard.focus();
  await expect(dashboard).toHaveCSS('outline-style', 'solid');
  const reads = await page.evaluate(() => (window as any).__userPageState.reads.length);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/dashboard$/);
  expect(await page.evaluate(() => (window as any).__userPageState.reads.length)).toBe(reads + 1);
  expect(await page.evaluate(() => (window as any).__userPageState.cachedReads)).toBe(0);
  await expect(page.locator('.layout-tv')).toHaveCount(0);
});

test('native page refresh reattaches one admin link without observer churn and layouts fit narrower screens', async ({ page }) => {
  await setup(page, 'mypreferencesmenu', true); await settingsMarkup(page);
  await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(1);
  await page.evaluate(() => {
    const host = document.querySelector('#myPreferencesMenuPage .readOnlyContent')!;
    const native = Array.from(host.children).filter(node => !node.classList.contains('tvl-settings-admin'));
    host.replaceChildren(...native);
  });
  await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(1);
  expect(await page.evaluate(async () => {
    let changes = 0; const observer = new MutationObserver(records => { changes += records.length; });
    observer.observe(document.querySelector('#myPreferencesMenuPage')!, { childList: true, subtree: true, attributes: true });
    const marker = document.createElement('span'); document.body.append(marker); marker.remove();
    for (let i = 0; i < 6; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    observer.disconnect(); return changes;
  })).toBe(0);
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('#myPreferencesMenuPage .readOnlyContent').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
  await page.evaluate(() => { document.querySelector('#myPreferencesMenuPage')!.classList.add('hide'); location.hash = '/search'; });
  await searchMarkup(page);
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator('#searchPage .searchFields').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
});

test('Cinema Search and Settings remain readable and focusable over the actual ElegantFin stylesheet', async ({ page }) => {
  test.skip(!elegantCss, 'Set TVL_ELEGANTFIN_CSS to the published ElegantFin CSS to exercise its real cascade.');
  await page.route('https://**/*', route => route.abort());
  await setup(page, 'search', true); await searchMarkup(page);
  await page.evaluate(() => { document.documentElement.dir = 'ltr'; });
  await page.evaluate(css => { const sheet = document.createElement('style'); sheet.textContent = css; document.head.append(sheet); }, elegantCss);
  const input = page.locator('#searchTextInput'); await input.focus();
  await expect(page.locator('#searchPage .searchFieldsInner')).toHaveCSS('flex-direction', 'row');
  await expect(page.locator('#searchPage .searchfields-icon')).toHaveCSS('margin-left', '0px');
  await expect(input).toHaveCSS('outline-style', 'solid'); await expect(input).toHaveCSS('outline-width', '2px');
  expect(await input.evaluate(node => {
    const css = getComputedStyle(node); return Math.abs(parseFloat(css.paddingLeft) - parseFloat(css.fontSize) * .8);
  })).toBeLessThan(1);
  const letter = page.locator('#searchPage').getByRole('button', { name: 'A', exact: true }); await letter.focus();
  await expect(letter).toHaveCSS('transform', 'none');
  await page.evaluate(() => { document.querySelector('#searchPage')!.classList.add('hide'); location.hash = '/mypreferencesmenu'; });
  await settingsMarkup(page);
  const link = page.getByRole('link', { name: 'Dashboard', exact: true }); await expect(link).toBeVisible(); await link.focus();
  await expect(link).toHaveCSS('background-color', 'rgb(52, 69, 60)');
  await expect(link).toHaveCSS('outline-style', 'solid');
  await expect(link).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  expect(await link.locator('.listItem').evaluate(node => {
    const css = getComputedStyle(node); return Math.abs(parseFloat(css.paddingLeft) - parseFloat(css.fontSize));
  })).toBeLessThan(1);
  await page.screenshot({ path: '/tmp/jellyfin-cinema-settings-elegantfin.png' });
});

test('desktop non-admin Settings exposes Collection rows beside streaming and loading preferences and preserves server context', async ({ page }) => {
  await setup(page, 'mypreferencesmenu?serverId=family-server', false, 'desktop'); await settingsMarkup(page);
  const link=page.locator('.tvl-settings-collections-link');
  await expect(link).toBeVisible();
  await expect(link.getByText('Collection rows',{exact:true})).toBeVisible();
  await expect(link.getByText('Home collections and seasonal rows',{exact:true})).toBeVisible();
  const group=link.locator('xpath=..');
  await expect(group.locator('.tvl-settings-provider-link')).toBeVisible();
  await expect(group.locator('.tvl-settings-loading-link')).toBeVisible();
  await expect(group.getByRole('heading',{name:/^ScreenHarbour$/i})).toBeVisible();
  await expect(page.locator('.tvl-settings-dashboard')).toHaveCount(0);
  const href=await link.getAttribute('href');
  const params=new URLSearchParams(href!.split('?')[1]);
  expect(params.get('cinemaCollections')).toBe('1'); expect(params.get('serverId')).toBe('family-server');
  // Native preference rebuilding may replace its children; attach just one
  // collection link to the rebuilt ScreenHarbour group without replacing native controls.
  await group.evaluate(node=>node.remove());
  await expect(link).toHaveCount(1);
  await expect(link).toBeVisible();
  await expect(page.getByRole('link',{name:'Profile',exact:true})).toBeVisible();
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Customize Home rows',exact:true})).toBeVisible();
});

test('Collection rows is absent from another user’s preferences and from TV or mobile Settings', async ({ page }) => {
  await setup(page, 'mypreferencesmenu?userId=someone-else', true, 'desktop'); await settingsMarkup(page);
  await expect(page.locator('.tvl-settings-collections-link')).toHaveCount(0);
  await expect(page.locator('.tvl-settings-providers')).toHaveCount(0);
  await page.evaluate(()=>{location.hash='/mypreferencesmenu?userId=demo';});
  await expect(page.locator('.tvl-settings-collections-link')).toBeVisible();
  await page.evaluate(()=>{document.documentElement.classList.add('layout-tv');});
  await expect(page.locator('.tvl-settings-collections-link')).toHaveCount(0);
  await expect(page.locator('.tvl-settings-provider-link')).toBeVisible();
  await page.evaluate(()=>{document.documentElement.classList.replace('layout-tv','layout-mobile');});
  await expect(page.locator('.tvl-settings-collections-link')).toHaveCount(0);
  await page.evaluate(()=>{document.documentElement.classList.remove('layout-mobile');});
  await expect(page.locator('.tvl-settings-collections-link')).toBeVisible();
  await page.evaluate(()=>window.TvItemLayout!.destroy());
  await expect(page.locator('.tvl-settings-collections-link')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Profile',exact:true})).toBeVisible();
});
