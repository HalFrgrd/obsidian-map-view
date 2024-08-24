import * as leaflet from 'leaflet';

// import '@fortawesome/fontawesome-free/js/all.min';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
import {
    library,
    IconPrefix,
    IconName,
    config as faConfig,
    findIconDefinition,
    icon as faIcon,
} from '@fortawesome/fontawesome-svg-core';

import 'leaflet-extra-markers';
import 'leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css';
// Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
// @ts-ignore
let localL = L;
import wildcard from 'wildcard';

import { MarkerIconRule } from 'src/settings';

// An extended Map View icon options, adding 'simple-circle' to the options of the 'shape' field.
export interface IconOptions
    extends Omit<leaflet.ExtraMarkers.IconOptions, 'shape'> {
    shape?: leaflet.ExtraMarkers.IconOptions['shape'] | 'simple-circle';
}

export function getIconFromRules(
    tags: string[],
    rules: MarkerIconRule[],
    iconFactory: IconFactory
) {
    // We iterate over the rules and apply them one by one, so later rules override earlier ones
    let result = rules.find((item) => item.ruleName === 'default').iconDetails;
    for (const rule of rules) {
        if (checkTagPatternMatch(rule.ruleName, tags)) {
            result = Object.assign({}, result, rule.iconDetails);
        }
    }
    return getIconFromOptions(result, iconFactory);
}

export function getIconFromOptions(
    iconSpec: IconOptions,
    iconFactory: IconFactory
): leaflet.Icon | leaflet.DivIcon {
    // Ugly hack for obsidian-leaflet compatability, see https://github.com/esm7/obsidian-map-view/issues/6
    // @ts-ignore
    const backupL = L;
    try {
        // @ts-ignore
        L = localL;
        if (iconSpec?.shape == 'simple-circle') {
            return createSimpleCircleMarker(iconSpec, iconFactory);
        } else {
            // We check for iconSpec.icon to allow a custom innerHTML specification for some rules,
            // and in such a case, do not wish to override the innerHTML by the icon rendition. See getIconFromRules above
            if (iconSpec.icon) {
                // If we got here, the icon is a leaflet.ExtraMarkers icon
                const internalIcon = getInternalIconFromOptions(
                    iconSpec,
                    iconFactory
                );
                iconSpec.innerHTML = internalIcon;
            }
            return leaflet.ExtraMarkers.icon(
                iconSpec as leaflet.ExtraMarkers.IconOptions
            );
        }
    } finally {
        // @ts-ignore
        L = backupL;
    }
}

export function createIconElement(
    containerEl: HTMLElement,
    icon: leaflet.Icon | leaflet.DivIcon
): HTMLElement {
    if ('html' in icon.options) {
        const element = containerEl.createDiv();
        element.innerHTML = (icon as leaflet.DivIcon).options.html as string;
        return element;
    } else return icon.createIcon();
}

function getInternalIconFromOptions(
    iconSpec: IconOptions,
    iconFactory: IconFactory
): string {
    const errorIcon = '<p class="mv-emoji-icon" style="color:white">❓</p>';
    if (isFontAwesome(iconSpec.icon)) {
        // The behavior of Leaflet Extra Markers is to render Font Awesome with Web Fonts & CSS, which has
        // proven too slow for displaying hundreds of markers.
        // This overrides the HTML generated by Extra Market to use the SVG Symbols alternative, which
        // seems much faster.
        // See here for more details: https://fontawesome.com/v5/docs/web/advanced/svg-symbols
        const icon = iconFactory.getIcon(iconSpec);
        return icon?.outerHTML || errorIcon;
    } else if (isText(iconSpec.icon)) {
        // Emoji or other short textual icon
        const color = iconSpec.iconColor ?? 'white';
        return `<p class="mv-emoji-icon" style="color:${color}">${iconSpec.icon}</p>`;
    } else return errorIcon;
}

function isFontAwesome(iconName: string) {
    if (iconName.startsWith('fa-')) return true;
}

function isText(iconName: string) {
    // Some emojis have a longer length so just checking for the string length isn't enough
    return iconName.length <= 2 || /\p{Extended_Pictographic}/u.test(iconName);
}

// Utilizes the SVG capabilities of Font Awesome to generate icons, instead of using Web Fonts.
// Since we create the SVGs directly where they are needed, we can affort to turn off the slow
// Font Awesome MutationObserver, see the issue here: https://github.com/esm7/obsidian-map-view/issues/216
export class IconFactory {
	initialized: boolean = false;

    constructor(containerEl: HTMLElement) {
        faConfig.observeMutations = false;
        faConfig.autoReplaceSvg = false;
    }

	init() {
		// Lazy initialization to not hurt Obsidian's startup time
		if (!this.initialized) {
			this.initialized = true;
			library.add(fas, far, fab);
		}
	}

    getIcon(iconSpec: IconOptions): SVGElement {
		if (!this.initialized)
			this.init();
        const iconName = iconSpec.icon.replace('fa-', '') as IconName;
        const newIconDef = findIconDefinition({
            prefix: iconSpec.prefix as IconPrefix,
            iconName: iconName,
        });
        if (!newIconDef) return null;
        const newIcon = faIcon(newIconDef);
        if (!newIcon) return null;
        const iconNode = newIcon.node[0] as SVGElement;
        iconNode.style.color = iconSpec.iconColor ?? 'white';
        return iconNode;
    }
}

export function checkTagPatternMatch(tagPattern: string, tags: string[]) {
    let match = wildcard(tagPattern, tags);
    return match && match.length > 0;
}

/*
 * Creates a marker icon of a simple circle instead of the Leaflet special marker.
 * The image in the middle of the circle is rendered with the same logic of regular markers.
 */
function createSimpleCircleMarker(
    iconSpec: IconOptions,
    iconFactory: IconFactory
): leaflet.DivIcon {
    const internalIcon = getInternalIconFromOptions(iconSpec, iconFactory);
    const circleIcon = leaflet.divIcon({
        className: '',
        html: `<div class="mv-simple-circle-marker" style="background-color: ${iconSpec.markerColor}">
		           ${internalIcon}
		       </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
    return circleIcon;
}
