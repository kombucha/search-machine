import algoliasearch from "algoliasearch";
import algolisearchHelper from "algoliasearch-helper";
import "./style.css";
import {
  Render,
  Engine,
  Bodies,
  Body,
  Composite,
  Composites,
  Runner,
  Common,
} from "matter-js";

interface MovieHit {
  index: number;
  poster_path?: string;
  title: string;
  overview: null | string;
  tagline: null | string;
  genres: string[];
  original_title: string;
  original_language: string;
  spoken_languages: string[];
  popularity: number;
  popularity_bucketed: number;
  vote_average: number;
  vote_count: number;
  budget: number;
  release_date: number;
  runtime: number;
  bayesian_avg: number;
  objectID: string;
}

type AlgoliaMetadata = {
  hit?: MovieHit;
  width: number;
  height: number;
  element: HTMLElement;
};
interface AlgoliaBody extends Body {
  algolia: AlgoliaMetadata;
}

function isAlgoliaBody(body: Body): body is AlgoliaBody {
  return "algolia" in body;
}

// Constants
const HITS_COLUMNS = 9;
const HITS_ROWS = 4;
const HITS_PER_PAGE = HITS_COLUMNS * HITS_ROWS;
const HIT_WIDTH = 72;
const HIT_HEIGHT = HIT_WIDTH * 1.5; // aspect ratio of movie posters on tmdb
const HITS_SPAWN_Y = -((HITS_ROWS + 2) * HIT_HEIGHT);
const NO_RESULT_WIDTH = 320;
const NO_RESULT_HEIGHT = 50;

const WORLD_WIDTH = (HITS_COLUMNS + 2) * HIT_WIDTH;
const WORLD_HEIGHT = (HITS_ROWS + 1) * HIT_HEIGHT;

const GROUND_CATEGORY = 0x0001;
const WALLS_CATEGORY = 0x0010;
const BOUNDARY_CATEGORY = GROUND_CATEGORY | WALLS_CATEGORY;
const HIT_CATEGORY = 0x0100;
const WRECKING_BALL_CATEGORY = 0x1000;

const COLLIDE_ALL_MASK =
  BOUNDARY_CATEGORY | HIT_CATEGORY | WRECKING_BALL_CATEGORY;

// Init dom elements
const searchInput = document.getElementById("search")!;
const detailsPopover = document.getElementById("details-popover")!;
const resultsContainer = document.getElementById("results-container")!;
const debuggerCanvas = document.getElementById(
  "debugger-canvas",
) as HTMLCanvasElement;
const debuggerToggle: HTMLInputElement =
  document.querySelector("#debugger-toggle")!;

document.body.style.setProperty("--world-width", `${WORLD_WIDTH}px`);
document.body.style.setProperty("--world-height", `${WORLD_HEIGHT}px`);

// Base elements
const boundaries = Composite.create({
  bodies: [
    // Ground
    Bodies.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT, WORLD_WIDTH, 20, {
      isStatic: true,
      label: "boundary",
      collisionFilter: {
        category: GROUND_CATEGORY,
        mask: COLLIDE_ALL_MASK,
      },
    }),
    // Left wall
    Bodies.rectangle(0, WORLD_HEIGHT / 2, 20, WORLD_HEIGHT, {
      isStatic: true,
      label: "boundary",
      collisionFilter: {
        category: WALLS_CATEGORY,
        mask: COLLIDE_ALL_MASK,
      },
    }),
    // Right wall
    Bodies.rectangle(WORLD_WIDTH, WORLD_HEIGHT / 2, 20, WORLD_HEIGHT, {
      isStatic: true,
      label: "boundary",
      collisionFilter: {
        category: WALLS_CATEGORY,
        mask: COLLIDE_ALL_MASK,
      },
    }),
  ],
});

const hits = Composite.create();

// Search Stuff
const client = algoliasearch(import.meta.env.VITE_ALGOLIA_APPLICATION_ID, import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY);
const helper = algolisearchHelper(client, "movies", {
  hitsPerPage: HITS_PER_PAGE,
  facets: ["record_type"],
});

helper.addFacetRefinement("record_type", "movie").search();

helper.on("result", (evt) => {
  markExistingResults();
  hideDetailsPopover();

  const startX = WORLD_WIDTH / 2 - (HITS_COLUMNS * HIT_WIDTH) / 2;

  if (evt.results.hits.length === 0) {
    Composite.add(hits, createNoResults());
    return;
  }

  let hitPosition = 0;

  const stack = Composites.pyramid(
    startX,
    HITS_SPAWN_Y,
    HITS_COLUMNS,
    HITS_ROWS,
    10,
    30,
    (x: number, y: number) => {
      const hit = evt.results.hits[hitPosition++];

      return hit
        ? createHit(x, y, { ...hit, index: hitPosition })
        : // Can't return null to create gaps, so we create a dummy body and remove it later
        Bodies.rectangle(x, y, 1, 1, { label: "dud" });
    },
  );
  stack.label = "hits-stack";

  Composite.remove(
    stack,
    stack.bodies.filter((b) => b.label === "dud"),
  );

  Composite.add(hits, stack);
});

// Search input
searchInput.addEventListener("input", (evt) => {
  const query = (evt.target as HTMLInputElement).value;
  helper.setQuery(query).search();
});

searchInput.addEventListener("focus", () =>
  document.body.classList.add("lights-on"),
);
searchInput.addEventListener("blur", () =>
  document.body.classList.remove("lights-on"),
);

// DESTROY
searchInput.addEventListener("keydown", (evt) => {
  if (
    [
      "Shift",
      "Meta",
      "Control",
      "Tab",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ].includes(evt.key) ||
    evt.metaKey
  ) {
    return;
  }

  const WRECKING_BALL_RADIUS = 100;

  const wreckingBall = Bodies.circle(
    Common.random(
      2 * WRECKING_BALL_RADIUS,
      WORLD_WIDTH - 2 * WRECKING_BALL_RADIUS,
    ),
    WORLD_HEIGHT + 2 * WRECKING_BALL_RADIUS,
    WRECKING_BALL_RADIUS,
    {
      render: { visible: true },
      label: "wreckingBall",
      friction: 0,
      frictionAir: 0,
      force: {
        x: Common.random(-0.5, 0.5),
        y: -6,
      },
      collisionFilter: {
        category: WRECKING_BALL_CATEGORY,
        mask: HIT_CATEGORY,
      },
    },
  );

  Composite.add(engine.world, wreckingBall);
});

const createHit = (x: number, y: number, hit: MovieHit): Body => {
  const element = document.createElement("div");
  element.id = hit.objectID;
  element.style.setProperty("--width", `${HIT_WIDTH}px`);
  element.style.setProperty("--height", `${HIT_HEIGHT}px`);
  element.style.setProperty(
    "--image-url",
    `url(https://image.tmdb.org/t/p/w94_and_h141_bestv2${hit.poster_path})`,
  );
  element.classList.add("hit", "hit-result");
  resultsContainer.appendChild(element);

  const body = Bodies.rectangle(x, y, HIT_WIDTH, HIT_HEIGHT, {
    label: "hit",
    friction: 1,
    collisionFilter: {
      category: HIT_CATEGORY,
      mask: COLLIDE_ALL_MASK,
    },
  });

  const metadata: AlgoliaMetadata = {
    hit,
    element,
    width: HIT_WIDTH,
    height: HIT_HEIGHT,
  };

  // @ts-expect-error
  body.algolia = metadata;

  return body;
};

const createNoResults = (): Body => {
  const noResults = Bodies.rectangle(
    WORLD_WIDTH / 2 - 50,
    HITS_SPAWN_Y,
    NO_RESULT_WIDTH,
    NO_RESULT_HEIGHT,
    {
      label: "hit",
      angle: -Math.PI / 6,
      friction: 1,
      collisionFilter: {
        category: HIT_CATEGORY,
        mask: COLLIDE_ALL_MASK,
      },
    },
  );

  const element = document.createElement("div");
  element.style.setProperty("--width", `${NO_RESULT_WIDTH}px`);
  element.style.setProperty("--height", `${NO_RESULT_HEIGHT}px`);
  element.classList.add("hit", "hit-no-results");
  element.innerText = "NO RESULTS";
  resultsContainer.appendChild(element);

  const metadata: AlgoliaMetadata = {
    element,
    width: NO_RESULT_WIDTH,
    height: NO_RESULT_HEIGHT,
  };
  // @ts-expect-error
  noResults.algolia = metadata;

  return noResults;
};

const markExistingResults = () => {
  for (const b of Composite.allBodies(engine.world)) {
    if (b.label === "boundary") continue;

    // Let hits and wrecking balls fall through
    b.collisionFilter.mask = 0;

    if (isAlgoliaBody(b)) {
      b.algolia.element.classList.add("hit-destroyed");
    }
  }
};

// create an engine
var engine = Engine.create({
  velocityIterations: 8,
  timing: { timeScale: 1.2 },
  // gravity: { x: 0, y: 1 },
});

// add all of the bodies to the world
Composite.add(engine.world, [boundaries, hits]);

// Update dom hits position
(function updateDomHits() {
  for (const hitBody of Composite.allBodies(hits)) {
    if (hitBody.isSleeping || !isAlgoliaBody(hitBody)) continue;

    const { position, angle } = hitBody;
    const { element, width, height } = hitBody.algolia as AlgoliaMetadata;

    element.style.setProperty("--x", `${Math.round(position.x - width / 2)}px`);
    element.style.setProperty(
      "--y",
      `${Math.round(position.y - height / 2)}px`,
    );
    const roundedAngle = Math.round(angle * 100) / 100;
    element.style.setProperty("--rotation", `${roundedAngle}rad`);
  }
  requestAnimationFrame(updateDomHits);
})();

// Remove elements that are out of bounds
setInterval(() => {
  const allComposites = Composite.allComposites(engine.world).concat(
    engine.world,
  );

  for (const composite of allComposites) {
    const outOfBoundsBodies = composite.bodies.filter(
      (b) => b.position.y > 2 * WORLD_HEIGHT,
    );

    for (const body of outOfBoundsBodies) {
      if (isAlgoliaBody(body)) {
        body.algolia.element.remove();
      }
    }

    Composite.remove(composite, outOfBoundsBodies);
  }
}, 1000);

// Details popover
document.addEventListener(
  "pointerenter",
  (evt) => {
    if (
      !(evt.target instanceof HTMLElement) ||
      evt.target.classList.contains("hit-destroyed")
    ) {
      return;
    }

    if (!evt.target.classList.contains("hit-result")) {
      return hideDetailsPopover();
    }
    const objectID = evt.target.id;

    for (const body of Composite.allBodies(hits)) {
      if (isAlgoliaBody(body) && body.algolia.hit?.objectID === objectID) {
        showDetailsPopover(body.algolia.hit);
      }
    }
  },
  true,
);

document.addEventListener(
  "pointerleave",
  () => {
    hideDetailsPopover();
  },
  true,
);

const showDetailsPopover = (hit: MovieHit) => {
  const releaseYear = hit.release_date
    ? new Date(hit.release_date).getFullYear()
    : 0;

  detailsPopover.innerHTML = `
    <p class="details-popover-index">#${hit.index}</p>
    <h3 class="details-popover-title">${hit.title} ${releaseYear && `(${releaseYear})`
    }</h3>
    <p class="details-popover-genres">${hit.genres.join(", ")}</p>
    <br/>
    <p class="details-popover-overview">${hit.overview}</p>
  `;

  detailsPopover.classList.add("shown");
};

const hideDetailsPopover = () => {
  detailsPopover.classList.remove("shown");
};

// Start simulation
const runner = Runner.create();
Runner.run(runner, engine);

// Debugger
debuggerToggle.addEventListener("change", (evt) => {
  if ((evt.target as HTMLInputElement).checked) {
    debuggerCanvas.style.removeProperty("display");
    Render.run(render)
  } else {
    debuggerCanvas.style.setProperty("display", 'none');
    Render.stop(render)

  }
});

const render = Render.create({
  engine: engine,
  canvas: debuggerCanvas,
  options: {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    showAngleIndicator: true,
    pixelRatio: window.devicePixelRatio,
    background: "transparent",
    wireframeBackground: "transparent",
    showSleeping: true,
  },
});

Render.run(render);

document.body.style.removeProperty("visibility");
