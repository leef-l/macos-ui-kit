import {Component} from "../component";
import {el, svgIcon, uid} from "../dom";
import "./taginput.css";

export interface TagInputOptions {
    /** Initial tags. */
    value?: string[];
    /** Placeholder shown while the field is empty. */
    placeholder?: string;
    /** Upper bound on the number of tags; unlimited when omitted. */
    max?: number;
    /** Allow the same text twice. Defaults to false. */
    allowDuplicates?: boolean;
    /** Label rendered above the control, wired to the input through `for`/`id`. */
    label?: string;
    disabled?: boolean;
    /** Fires after a commit or a removal, with a copy of the tag list. */
    onChange?: (value: string[]) => void;
}

/** The × glyph on a chip, drawn at 8px inside a 10-unit view box. */
const REMOVE_PATH = "M2.5 2.5 L7.5 7.5 M7.5 2.5 L2.5 7.5";

/**
 * A macOS token field: chips plus a bare input inside one bordered box.
 *
 * The input is a real `<input>`, not a contenteditable, so the caret, selection
 * and IME composition stay native. It is the last child of the control and grows
 * into the leftover space, which keeps the caret right after the last chip
 * without a hidden sizer span whose measurement could drift from the real font.
 *
 * Chips carry a real `<button>` for removal so the affordance is reachable by
 * Tab and activates on Enter/Space without extra key handling. Their press,
 * click and key listeners are delegated on the control: chips come and go, and
 * a listener per chip would pile up cleanups in the base class for every tag a
 * user ever typed.
 */
export class TagInput extends Component<HTMLDivElement> {
    protected readonly root: HTMLDivElement;

    private readonly control: HTMLDivElement;
    private readonly input: HTMLInputElement;
    private readonly onChange?: (value: string[]) => void;
    private readonly allowDuplicates: boolean;
    private readonly max?: number;

    /** Chip elements, index-aligned with `tags`. */
    private chips: HTMLSpanElement[] = [];
    private tags: string[];

    constructor(options: TagInputOptions = {}) {
        super();

        const {
            value = [],
            placeholder = "添加标签",
            max,
            allowDuplicates = false,
            label,
            disabled = false,
            onChange,
        } = options;

        this.max = max;
        this.allowDuplicates = allowDuplicates;
        this.onChange = onChange;

        this.root = el("div", {class: "mac-taginput"});

        const inputId = uid("mac-taginput");

        if (label !== undefined) {
            this.root.appendChild(
                el("label", {
                    class: "mac-taginput__label",
                    for: inputId,
                    text: label,
                }),
            );
        }

        this.control = el("div", {class: "mac-taginput__control"});

        this.input = el("input", {
            class: "mac-taginput__input",
            type: "text",
            id: inputId,
            placeholder,
            disabled,
            autocomplete: "off",
        });

        // `el` skips falsy values, so the spellchecker is switched off here.
        this.input.spellcheck = false;

        this.control.appendChild(this.input);
        this.root.appendChild(this.control);

        this.tags = this.normalize(value);
        this.renderChips();

        this.listen(this.input, "keydown", (event) => this.onFieldKeyDown(event));
        this.listen(this.input, "blur", () => this.commitDraft());

        this.listen(this.control, "click", (event) => this.onControlClick(event));
        this.listen(this.control, "keydown", (event) => this.onChipKeyDown(event));
        this.listen(this.control, "mousedown", (event) => this.onControlPress(event));

        if (disabled) this.setDisabled(true);
    }

    /** The current tags, as a copy. */
    get value(): string[] {
        return [...this.tags];
    }

    /** Replace every tag; silent, like every setter in the kit. */
    setValue(tags: string[]): void {
        this.tags = this.normalize(tags);
        this.renderChips();
    }

    /** Enable or disable the field and every chip's remove button. */
    setDisabled(disabled: boolean): void {
        if (this.input.disabled === disabled) return;
        this.input.disabled = disabled;

        for (const chip of this.chips) {
            const remove = chip.querySelector<HTMLButtonElement>(
                ".mac-taginput__tag-remove",
            );
            if (remove) remove.disabled = disabled;
        }

        this.toggleClass("is-disabled", disabled);
    }

    /** Replace the placeholder text. */
    setPlaceholder(text: string): void {
        if (this.input.placeholder === text) return;
        this.input.placeholder = text;
    }

    /** Move keyboard focus into the field. */
    focus(): void {
        this.input.focus();
    }

    /**
     * Commit the pending text.
     *
     * The whole draft is split on separators: a paste can arrive as one
     * "a, b, c" string, and committing only the first chunk would silently drop
     * the rest.
     */
    private commitDraft(): void {
        const draft = this.input.value;
        this.input.value = "";

        if (draft.trim() === "") return;

        const before = this.tags.length;
        for (const piece of draft.split(/[,，\n]/)) this.addTag(piece);
        if (this.tags.length !== before) this.emitChange();
    }

    /** Append one tag if the control's rules accept it. */
    private addTag(text: string): void {
        const tag = text.trim();
        if (tag === "") return;
        if (this.max !== undefined && this.tags.length >= this.max) return;
        if (!this.allowDuplicates && this.tags.includes(tag)) return;

        this.tags.push(tag);
        const chip = this.createChip(tag);
        this.chips.push(chip);
        this.control.insertBefore(chip, this.input);
    }

    /** Remove the tag at an index and report the change. */
    private removeAt(index: number): void {
        const chip = this.chips[index];
        if (!chip) return;

        // Focus has to land somewhere: removing the button that holds it would
        // leave focus on `body` and drop a keyboard user out of the control.
        const hadFocus = chip.contains(document.activeElement);

        this.tags.splice(index, 1);
        this.chips.splice(index, 1);
        chip.remove();

        if (hadFocus) this.input.focus();
        this.emitChange();
    }

    /** Draw the chips for the current tag list, keeping the input last. */
    private renderChips(): void {
        for (const chip of this.chips) chip.remove();
        this.chips = this.tags.map((tag) => this.createChip(tag));

        const fragment = document.createDocumentFragment();
        for (const chip of this.chips) fragment.appendChild(chip);
        this.control.insertBefore(fragment, this.input);
    }

    private createChip(tag: string): HTMLSpanElement {
        const chip = el("span", {class: "mac-taginput__tag"});
        chip.appendChild(el("span", {class: "mac-taginput__tag-label", text: tag}));

        const remove = el("button", {
            class: "mac-taginput__tag-remove",
            type: "button",
            disabled: this.input.disabled,
            "aria-label": `移除 ${tag}`,
            title: `移除 ${tag}`,
        });
        remove.appendChild(svgIcon(REMOVE_PATH, 8, "0 0 10 10"));
        chip.appendChild(remove);

        return chip;
    }

    /**
     * Apply the control's own rules to a list of tags: trim, drop empties,
     * honour `allowDuplicates` and `max`.
     *
     * `setValue` runs through this too, so the control can never be put into a
     * state its own commit path would refuse to produce.
     */
    private normalize(tags: string[]): string[] {
        const result: string[] = [];

        for (const tag of tags) {
            const text = tag.trim();
            if (text === "") continue;
            if (!this.allowDuplicates && result.includes(text)) continue;
            result.push(text);
            if (this.max !== undefined && result.length >= this.max) break;
        }

        return result;
    }

    /**
     * Report the tag list.
     *
     * The array is copied because a caller that sorts or splices what it
     * receives would otherwise reach into the control's own state.
     */
    private emitChange(): void {
        this.onChange?.([...this.tags]);
    }

    private indexFor(button: HTMLButtonElement): number {
        const chip = button.closest<HTMLSpanElement>(".mac-taginput__tag");
        return chip ? this.chips.indexOf(chip) : -1;
    }

    private onControlClick(event: MouseEvent): void {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
            ".mac-taginput__tag-remove",
        );
        if (!button) return;

        const index = this.indexFor(button);
        if (index >= 0) this.removeAt(index);
    }

    /**
     * Move focus into the field from anywhere in the box.
     *
     * The press is defaulted away rather than left alone: focus moving through
     * the field would blur it first, and a blur commits the draft, so clicking
     * the padding would post a tag nobody asked for. The chip buttons are
     * excluded so their own press and focus behaviour stays intact.
     */
    private onControlPress(event: MouseEvent): void {
        const target = event.target as HTMLElement;
        if (target === this.input || target.closest("button")) return;
        event.preventDefault();
        this.input.focus();
    }

    private onChipKeyDown(event: KeyboardEvent): void {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
            ".mac-taginput__tag-remove",
        );
        if (!button || button.disabled) return;

        const index = this.indexFor(button);
        if (index < 0) return;

        if (event.key === "Backspace" || event.key === "Delete") {
            event.preventDefault();
            this.removeAt(index);
            return;
        }

        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();

        // The chips are one row of focus stops: the arrows walk them and fall out
        // of either end back into the field, so focus can never get stuck in a
        // chip with no way back to typing.
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = this.chips[index + step]?.querySelector<HTMLButtonElement>(
            ".mac-taginput__tag-remove",
        );
        (next ?? this.input).focus();
    }

    private onFieldKeyDown(event: KeyboardEvent): void {
        switch (event.key) {
            case "Enter":
                event.preventDefault();
                this.commitDraft();
                return;
            case ",":
            case "，":
                // Chinese input commits the full-width comma on the same key, and
                // the default placeholder is Chinese: both have to mean "commit".
                event.preventDefault();
                this.commitDraft();
                return;
            case "Backspace":
                // Only an empty field means "take the previous chip"; otherwise
                // Backspace is deleting a character the user is still typing.
                if (this.input.value !== "") return;
                event.preventDefault();
                this.removeAt(this.tags.length - 1);
                return;
            case "ArrowLeft": {
                // Only from the very start of the draft: anywhere else the arrow
                // belongs to the caret.
                if (this.input.selectionStart !== 0 || this.input.selectionEnd !== 0) {
                    return;
                }
                const last = this.chips[this.chips.length - 1];
                const button = last?.querySelector<HTMLButtonElement>(
                    ".mac-taginput__tag-remove",
                );
                if (!button) return;
                event.preventDefault();
                button.focus();
                return;
            }
            default:
                return;
        }
    }
}
