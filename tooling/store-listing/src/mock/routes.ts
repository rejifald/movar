import {
  GOOGLE_QUERY,
  googleFinalPage,
  googleInitialPage,
  tochka24Page,
  youtubeDesktopPage,
  youtubeFeedPage,
} from './pages';

/** What a route yields: a rendered page, a redirect, or an empty 204. */
export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type RouteTable = (host: string, target: string) => MockResponse | null;

export const MOCK_HOSTS: readonly string[] = [
  'www.google.com',
  'google.com',
  'tochka24.example',
  'm.youtube.com',
  'www.youtube.com',
];

/** The scenes' entry URLs and where Movar is expected to leave the browser. */
export const SCENES = {
  google: {
    startUrl: `https://www.google.com/search?q=${encodeURIComponent(GOOGLE_QUERY).replaceAll('%20', '+')}`,
    /** Final URL carries the `hl=uk` Movar's searchParams rewrite adds. */
    finalHl: 'uk',
  },
  tochka24: {
    startUrl: 'https://tochka24.example/',
    finalUrl: 'https://tochka24.example/uk/',
  },
  youtube: {
    startUrl: 'https://m.youtube.com/',
  },
  youtubeDesktop: {
    startUrl: 'https://www.youtube.com/',
  },
} as const;

const NO_STORE = 'no-store';

function html(body: string): MockResponse {
  return {
    status: HTTP_OK,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': NO_STORE },
    body,
  };
}

const MOVED_PERMANENTLY = 301;
const HTTP_OK = 200;

function redirect(location: string, status = MOVED_PERMANENTLY): MockResponse {
  return { status, headers: { location, 'cache-control': NO_STORE }, body: '' };
}

const NO_CONTENT = 204;
const EMPTY: MockResponse = {
  status: NO_CONTENT,
  headers: { 'cache-control': NO_STORE },
  body: '',
};

function googleRoute(host: string, url: URL): MockResponse | null {
  if (host === 'google.com') return redirect(`https://www.google.com${url.pathname}${url.search}`);
  if (url.pathname !== '/search' || url.searchParams.get('q') !== GOOGLE_QUERY) return null;
  // Movar's rewrite (DNR on Chromium, content script elsewhere) adds hl=uk.
  return html(url.searchParams.get('hl') === 'uk' ? googleFinalPage() : googleInitialPage());
}

function tochka24Route(url: URL): MockResponse | null {
  switch (url.pathname) {
    case '/': {
      return html(tochka24Page('ru', { gate: true }));
    }
    case '/ru/': {
      return html(tochka24Page('ru'));
    }
    case '/uk/': {
      return html(tochka24Page('uk'));
    }
    case '/en/': {
      return html(tochka24Page('en'));
    }
    default: {
      return null;
    }
  }
}

function youtubeRoute(host: string, url: URL): MockResponse | null {
  if (url.pathname !== '/') return null;
  return html(host === 'm.youtube.com' ? youtubeFeedPage() : youtubeDesktopPage());
}

/**
 * Requests a browser makes on its own for a mocked host, not for a page: site icons
 * (Safari, Chrome and Firefox ask for `/favicon.ico`, some for `.png`/`.svg`
 * variants), manifests Windows/Chromium probe for, DevTools' well-known probe, and
 * the Start Page's Favourites fetching a bookmarked home page
 * (`/?client=safari…`, CI run 17), and on Google hosts Chrome's own `/async/…`
 * fetches (`/async/folae?…&udm=50`, the omnibox's AI-mode prefetch, desktop CI run
 * 44103936330), which no mock page makes. Answered empty, so they are neither
 * content nor a miss; anything else unrouted still fails the run.
 */
function isBrowserChrome(host: string, url: URL): boolean {
  if (host.endsWith('google.com') && url.pathname.startsWith('/async/')) return true;
  if (/^\/favicon(?:-\w+)?\.(?:ico|png|svg)$/u.test(url.pathname)) return true;
  if (['/browserconfig.xml', '/site.webmanifest'].includes(url.pathname)) return true;
  if (url.pathname.startsWith('/.well-known/appspecific/')) return true;
  if (/^\/apple-touch-icon[\w.-]*\.png$/u.test(url.pathname)) return true;
  return url.pathname === '/' && url.searchParams.get('client') === 'safari';
}

/** Pure route table: (host, path+query) → response, or null when unrouted. */
export const resolveRoute: RouteTable = (host, target) => {
  if (!MOCK_HOSTS.includes(host)) return null;
  const url = new URL(target, `https://${host}`);
  if (isBrowserChrome(host, url)) return EMPTY;
  if (host.endsWith('google.com')) return googleRoute(host, url);
  if (host === 'tochka24.example') return tochka24Route(url);
  return youtubeRoute(host, url);
};

/** The route table plus the hosts it answers for — what the proxy consumes. */
export interface MockRoutes {
  hosts: readonly string[];
  resolve: RouteTable;
}

export const mockRoutes: MockRoutes = { hosts: MOCK_HOSTS, resolve: resolveRoute };
