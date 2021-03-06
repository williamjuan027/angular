import { Inject, Injectable, NgZone, Optional, Renderer2, RendererFactory2, RendererStyleFlags2, RendererType2, ViewEncapsulation } from "@angular/core";
import { Application, ContentView, Device, getViewById, profile, View } from "@nativescript/core";
import { getViewClass, isKnownView, NgView } from "./element-registry";
import { NamespaceFilter } from "./property-filter";
import { APP_ROOT_VIEW, NAMESPACE_FILTERS } from "./tokens";
import { NativeScriptDebug } from "./trace";
import { ViewUtil } from "./view-util";

const addStyleToCss = profile('"renderer".addStyleToCss', function addStyleToCss(style: string): void {
    Application.addCss(style);
});

export class NativeScriptRendererFactory implements RendererFactory2 {
    private componentRenderers = new Map<string, Renderer2>();
    private defaultRenderer: Renderer2;

    constructor(@Inject(APP_ROOT_VIEW) private rootView: View, @Inject(NAMESPACE_FILTERS) private namespaceFilters: NamespaceFilter[]) {
        this.defaultRenderer = new NativeScriptRenderer(rootView, namespaceFilters);
    }
    createRenderer(hostElement: any, type: RendererType2): Renderer2 {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRendererFactory.createRenderer ${hostElement}. type.id: ${type.id} type.encapsulation: ${type.encapsulation}`);
        }
        if (!hostElement || !type) {
            return this.defaultRenderer;
        }

        let renderer = this.componentRenderers.get(type.id);
        if (renderer) {
            if (renderer instanceof EmulatedRenderer) {
                renderer.applyToHost(hostElement);
            }

            return renderer;
        }

        if (type.encapsulation === ViewEncapsulation.None) {
            type.styles.map((s) => s.toString()).forEach(addStyleToCss);
            renderer = this.defaultRenderer;
        } else {
            renderer = new EmulatedRenderer(type, hostElement, this.namespaceFilters);
            (<EmulatedRenderer>renderer).applyToHost(hostElement);
        }

        this.componentRenderers.set(type.id, renderer);
        return renderer;
    }
    // begin?(): void {
    //     throw new Error("Method not implemented.");
    // }
    // end?(): void {
    //     throw new Error("Method not implemented.");
    // }
    // whenRenderingDone?(): Promise<any> {
    //     throw new Error("Method not implemented.");
    // }
}


class NativeScriptRenderer implements Renderer2 {

    private viewUtil = new ViewUtil(this.namespaceFilters);

    constructor(private rootView: View, private namespaceFilters?: NamespaceFilter[]) { }
    get data(): { [key: string]: any; } {
        throw new Error("Method not implemented.");
    }
    destroy(): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog('NativeScriptRenderer.destroy');
        }
    }
    createElement(name: string, namespace?: string) {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.createElement: ${name}`);
        }
        let oldName;
        if (!isKnownView(name)) {
            oldName = name;
            name = 'ProxyViewContainer';
        }
        const view = this.viewUtil.createView(name);
        if (oldName) { (view as any).customCSSName = oldName; }
        return view;
    }
    createComment(value: string) {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.createComment ${value}`);
        }
        return this.viewUtil.createComment(value);
    }
    createText(value: string) {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.createText ${value}`);
        }
        return this.viewUtil.createText(value);
    }
    destroyNode: (node: any) => void = (node: View) => {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.destroyNode node: ${node}`);
        }
        // TODO: destroy this node
    };
    appendChild(parent: View, newChild: View): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.appendChild child: ${newChild} parent: ${parent}`);
        }
        this.viewUtil.appendChild(parent, newChild);
    }
    insertBefore(parent: any, newChild: any, refChild: any): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.insertBefore child: ${newChild} ` + `parent: ${parent} refChild: ${refChild}`);
        }
        this.viewUtil.insertBefore(parent, newChild, refChild);
    }
    removeChild(parent: any, oldChild: any, isHostElement?: boolean): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.removeChild child: ${oldChild} parent: ${parent}`);
        }
        this.viewUtil.removeChild(parent, oldChild);
    }
    selectRootElement(selectorOrNode: any, preserveContent?: boolean) {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.selectRootElement: ${selectorOrNode}`);
        }
        if (selectorOrNode instanceof View) {
            return selectorOrNode;
        }
        if (selectorOrNode && selectorOrNode[0] === '#') {
            const result = getViewById(this.rootView, selectorOrNode.slice(1));
            return (result || this.rootView) as View;
        }
        return this.rootView;
    }
    parentNode(node: NgView) {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.parentNode for node: ${node} is ${node.parentNode}`);
        }
        return node.parentNode;
    }
    nextSibling(node: NgView) {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.nextSibling of ${node} is ${node.nextSibling}`);
        }
        return node.nextSibling;
    }
    setAttribute(el: any, name: string, value: string, namespace?: string): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.setAttribute ${namespace ? namespace + ':' : ''}${el}.${name} = ${value}`);
        }
        this.viewUtil.setProperty(el, name, value, namespace);
    }
    removeAttribute(el: any, name: string, namespace?: string): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.removeAttribute ${namespace ? namespace + ':' : ''}${el}.${name}`);
        }
    }
    addClass(el: any, name: string): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.addClass ${name}`);
        }
        this.viewUtil.addClass(el, name);
    }
    removeClass(el: any, name: string): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.removeClass ${name}`);
        }
        this.viewUtil.removeClass(el, name);
    }
    setStyle(el: any, style: string, value: any, flags?: RendererStyleFlags2): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.setStyle: ${el}, ${style} = ${value}`);
        }
        this.viewUtil.setStyle(el, style, value);
    }
    removeStyle(el: any, style: string, flags?: RendererStyleFlags2): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog('NativeScriptRenderer.removeStyle: ${styleName}');
        }
        this.viewUtil.removeStyle(el, style);
    }
    setProperty(el: any, name: string, value: any): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.setProperty ${el}.${name} = ${value}`);
        }
        this.viewUtil.setProperty(el, name, value);
    }
    setValue(node: any, value: string): void {
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.setValue renderNode: ${node}, value: ${value}`);
        }
        // throw new Error("Method not implemented.");
    }
    listen(target: any, eventName: string, callback: (event: any) => boolean | void): () => void {
        // throw new Error("Method not implemented.");
        if (NativeScriptDebug.enabled) {
            NativeScriptDebug.rendererLog(`NativeScriptRenderer.listen: ${eventName}`);
        }
        return () => { };
    }

}



// CONTENT_ATTR not exported from NativeScript_renderer - we need it for styles application.
const COMPONENT_REGEX = /%COMP%/g;
const ATTR_SANITIZER = /-/g;
export const COMPONENT_VARIABLE = '%COMP%';
export const HOST_ATTR = `_nghost-${COMPONENT_VARIABLE}`;
export const CONTENT_ATTR = `_ngcontent-${COMPONENT_VARIABLE}`;

const replaceNgAttribute = function(input: string, componentId: string): string {
    return input.replace(COMPONENT_REGEX, componentId);
};

const addScopedStyleToCss = profile(`"renderer".addScopedStyleToCss`, function addScopedStyleToCss(style: string): void {
    Application.addCss(style, true);
});

@Injectable()
export class EmulatedRenderer extends NativeScriptRenderer {
    private contentAttr: string;
    private hostAttr: string;

    constructor(component: RendererType2, rootView: View, namespaceFilters: NamespaceFilter[]) {
        super(rootView, namespaceFilters);

        const componentId = component.id.replace(ATTR_SANITIZER, '_');
        this.contentAttr = replaceNgAttribute(CONTENT_ATTR, componentId);
        this.hostAttr = replaceNgAttribute(HOST_ATTR, componentId);
        this.addStyles(component.styles, componentId);
    }

    applyToHost(view: NgView) {
        super.setAttribute(view, this.hostAttr, '');
    }

    appendChild(parent: any, newChild: NgView): void {
        super.appendChild(parent, newChild);
    }

    createElement(parent: any, name: string): NgView {
        const view = super.createElement(parent, name);

        // Set an attribute to the view to scope component-specific css.
        // The property name is pre-generated by Angular.
        super.setAttribute(view, this.contentAttr, '');

        return view;
    }

    @profile
    private addStyles(styles: (string | any[])[], componentId: string) {
        styles
            .map((s) => s.toString())
            .map((s) => replaceNgAttribute(s, componentId))
            .forEach(addScopedStyleToCss);
    }
}

