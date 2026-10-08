import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { groupCategories } from '../../lib/categories';

const normalize = (text) => text.toLocaleLowerCase('tr');

/**
 * Searchable category picker grouped by group_name (combobox).
 * Typing filters by category or group name; ↑ ↓ Enter select, Esc closes.
 * Keeps showing a value that no longer exists among the categories.
 */
export default function CategorySelect({ categories, type, value, onChange, id }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);
  const listId = useId();

  const groups = useMemo(() => groupCategories(categories, type), [categories, type]);

  // Visible options in display order, with their group for headings
  const options = useMemo(() => {
    const term = normalize(query.trim());
    return groups.flatMap((group) => {
      const isGroupMatch = term && normalize(group.groupName).includes(term);
      return group.categories
        .filter((category) => !term || isGroupMatch || normalize(category.name).includes(term))
        .map((category) => ({ name: category.name, groupName: group.groupName, key: category.id }));
    });
  }, [groups, query]);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  function open() {
    setQuery('');
    // Start on the current value so the list opens where the user left off
    const currentIndex = options.findIndex((option) => option.name === value);
    setActiveIndex(currentIndex === -1 ? 0 : currentIndex);
    setIsOpen(true);
  }

  function select(name) {
    onChange(name);
    setIsOpen(false);
    setQuery('');
  }

  function handleKeyDown(event) {
    if (!isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      // Never submit the surrounding form while choosing
      event.preventDefault();
      if (options[activeIndex]) select(options[activeIndex].name);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
    } else if (event.key === 'Tab') {
      setIsOpen(false);
    }
  }

  return (
    <div className={`combobox ${isOpen ? 'is-open' : ''}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={isOpen ? query : value}
        placeholder={isOpen ? value || 'Kategori ara…' : '— Seçin —'}
        onFocus={open}
        onClick={() => !isOpen && open()}
        onBlur={() => setIsOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {value && !isOpen ? (
        <button
          type="button"
          className="combobox__clear"
          aria-label="Kategoriyi temizle"
          // mousedown keeps focus out of the input so the list does not open
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            // The field sits inside a <label>: cancel the label's click forwarding, which would reopen the list
            event.preventDefault();
            onChange('');
          }}
        >
          <X size={14} />
        </button>
      ) : (
        <ChevronDown size={16} className="combobox__chevron" aria-hidden="true" />
      )}

      {isOpen && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="combobox__list"
          // mousedown: keep focus in the input; click: stop the surrounding <label> from
          // forwarding the click to the input, which would reopen the list right after selecting
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
        >
          {options.length === 0 && <li className="combobox__empty">"{query}" ile eşleşen kategori yok</li>}
          {options.map((option, index) => (
            <li key={option.key} role="presentation">
              {(index === 0 || options[index - 1].groupName !== option.groupName) && (
                <div className="combobox__group">{option.groupName}</div>
              )}
              <div
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.name === value}
                className={`combobox__option ${index === activeIndex ? 'is-active' : ''} ${option.name === value ? 'is-selected' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(option.name)}
              >
                {option.name}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
