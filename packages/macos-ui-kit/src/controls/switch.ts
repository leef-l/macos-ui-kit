import {Component} from "../component";
import {el} from "../dom";
import "./switch.css";

export interface SwitchOptions {
    /** Initial on/off state. Default off. */
    checked?: boolean;
    disabled?: boolean;
    /**
     * Accessible name, exposed as `aria-label`. A switch is drawn as a bare
     * track, so the label cannot sit inside the control itself.
     */
    label?: string;
    /** Fires with the new state after a user toggle; setters stay silent. */
    onChange?: (checked: boolean) => void;
}

/**
 * A macOS switch on a native `<button role="switch">`.
 *
 * The track and the knob are two elements, and the knob travels with
 * `transform` only: animating `left` or `width` would lay the control out on
 * every frame (design rule 7). Pointer activation arrives as a `click`, while
 * Space and Enter are handled on `keydown` so the state flips once per press
 * and Space never scrolls the pane behind the switch.
 */
export class Switch extends Component<HTMLElement> {
    protected readonly root: HTMLButtonElement;

    private readonly onChange?: (checked: boolean) => void;
    private isOn: boolean;

    constructor(options: SwitchOptions = {}) {
        super();

        const {checked = false, disabled = false, label, onChange} = options;

        this.isOn = checked;
        this.onChange = onChange;

        this.root = el("button", {
            class: "mac-switch",
            type: "button",
            role: "switch",
            "aria-checked": String(checked),
            "aria-label": label,
            disabled,
        });

        this.root.appendChild(el("span", {class: "mac-switch__knob"}));

        this.listen(this.root, "click", () => this.toggle());

        // A native button synthesises its own click for these two keys. Flipping
        // here and cancelling the default keeps one press to one toggle, and
        // stops Space from scrolling the pane behind the switch.
        this.listen(this.root, "keydown", (event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            this.toggle();
        });
    }

    /** The current state. */
    get checked(): boolean {
        return this.isOn;
    }

    /** Set the state; a write that changes nothing is skipped, and `onChange` stays silent. */
    setChecked(checked: boolean): void {
        if (this.isOn === checked) return;
        this.isOn = checked;
        this.syncState();
    }

    /** Enable or disable the switch, using the native attribute. */
    setDisabled(disabled: boolean): void {
        if (this.root.disabled === disabled) return;
        this.root.disabled = disabled;
    }

    /** Move keyboard focus onto the switch. */
    focus(): void {
        this.root.focus();
    }

    /** Flip the state from a user gesture and report it. */
    private toggle(): void {
        this.setChecked(!this.isOn);
        this.onChange?.(this.isOn);
    }

    /**
     * Write the state to `aria-checked`.
     *
     * That attribute is what the stylesheet slides the knob on and what a
     * screen reader announces, so one write keeps the picture and the
     * semantics in step.
     */
    private syncState(): void {
        this.setAttr("aria-checked", String(this.isOn));
    }
}
