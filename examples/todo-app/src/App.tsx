import { useState } from 'react';
import { useExpose, useAgentPulse } from 'agentpulse';
import type { Todo, Filter } from './types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export default function App() {
  const { isConnected } = useAgentPulse();
  const [todos, setTodos] = useState<Todo[]>([
    { id: '1', text: 'Learn AgentPulse', completed: false, createdAt: Date.now() },
    { id: '2', text: 'Build something cool', completed: false, createdAt: Date.now() },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Derived state
  const activeCount = todos.filter((t) => !t.completed).length;
  const completedCount = todos.filter((t) => t.completed).length;
  const filteredTodos = todos.filter((todo) => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  // Actions
  const addTodo = (text?: string) => {
    const todoText = text ?? inputValue.trim();
    if (!todoText) return;

    const newTodo: Todo = {
      id: generateId(),
      text: todoText,
      completed: false,
      createdAt: Date.now(),
    };

    setTodos((prev) => [...prev, newTodo]);
    setInputValue('');
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id
          ? { id: todo.id, text: todo.text, completed: !todo.completed, createdAt: todo.createdAt }
          : todo
      )
    );
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  const clearCompleted = () => {
    setTodos((prev) => prev.filter((todo) => !todo.completed));
  };

  const toggleAll = () => {
    const allCompleted = todos.every((t) => t.completed);
    setTodos((prev) =>
      prev.map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: !allCompleted,
        createdAt: todo.createdAt,
      }))
    );
  };

  // Expose todo input for MCP control
  useExpose('todo-input', {
    value: inputValue,
    setValue: setInputValue,
    add: addTodo,
  }, {
    description: 'Input field for adding new todos. Use add(text) to create a todo, or setValue(text) then add() to add from current value.',
  });

  // Expose todo list for MCP control
  useExpose('todo-list', {
    todos: filteredTodos,
    allTodos: todos,
    count: todos.length,
    activeCount,
    completedCount,
    filter,
    setFilter,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    toggleAll,
  }, {
    description: 'Todo list with filtering and bulk actions. Use toggleTodo(id) to check/uncheck, deleteTodo(id) to remove, setFilter("all"|"active"|"completed") to filter.',
  });

  return (
    <div>
      <h1>Todo App</h1>

      {/* Input */}
      <div className="todo-input">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          placeholder="What needs to be done?"
        />
        <button onClick={() => addTodo()} disabled={!inputValue.trim()}>
          Add
        </button>
      </div>

      {/* Filters */}
      <div className="filters">
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({todos.length})
        </button>
        <button
          className={filter === 'active' ? 'active' : ''}
          onClick={() => setFilter('active')}
        >
          Active ({activeCount})
        </button>
        <button
          className={filter === 'completed' ? 'active' : ''}
          onClick={() => setFilter('completed')}
        >
          Completed ({completedCount})
        </button>
      </div>

      {/* Todo List */}
      <ul className="todo-list">
        {filteredTodos.map((todo) => (
          <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
            />
            <span className="todo-text">{todo.text}</span>
            <button className="todo-delete" onClick={() => deleteTodo(todo.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Stats */}
      {todos.length > 0 && (
        <div className="stats">
          {activeCount} item{activeCount !== 1 ? 's' : ''} left
          {completedCount > 0 && (
            <>
              {' · '}
              <button
                onClick={clearCompleted}
                style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', padding: 0 }}
              >
                Clear completed
              </button>
            </>
          )}
        </div>
      )}

      {/* Connection Status */}
      <div className="mcp-status" style={{ color: isConnected ? 'green' : 'red' }}>
        {isConnected ? 'Connected to MCP server' : 'Disconnected from MCP server'}
      </div>
    </div>
  );
}
