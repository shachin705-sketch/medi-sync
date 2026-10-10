import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Sparkles, MessageSquare } from 'lucide-react';
import { api } from '../utils/api';

export default function StaffChatbotModal({ phcId, onClose, lang = 'en' }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: lang === 'ta'
        ? 'வணக்கம்! நான் MediSync AI மருத்துவ உதவியாளர். மருந்து இருப்பு, அருகிலுள்ள உபரி இருப்பு அல்லது அவசர எச்சரிக்கைகள் பற்றி ஏதேனும் கேட்கலாம்.'
        : 'Vanakkam! I am your MediSync Clinical AI Stock Assistant. Ask me about stock levels, days remaining, or nearest surplus centres.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const quickPrompts = lang === 'ta' ? [
    'அருகில் யாருக்கு ORS உள்ளது, எவ்வளவு தூரம்?',
    'பாராசிட்டமால் சிரப் எத்தனை நாட்கள் வரும்?',
    'இன்றைய அவசர எச்சரிக்கைகள் என்ன?',
    'அமாக்சிசிலின் இருப்பு நிலவரம் என்ன?'
  ] : [
    'Who nearby has ORS and how far is it?',
    'How many days of Paracetamol syrup do we have?',
    'What are our active stock alerts today?',
    'Is there surplus Amoxicillin nearby?'
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (queryText) => {
    const textToSend = queryText || input;
    if (!textToSend.trim()) return;

    const userMsg = { role: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setLoading(true);

    try {
      const res = await api.queryChatbot(textToSend, phcId);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.answer || 'No answer found.',
          data: res.data
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Error contacting AI assistant: ' + err.message
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">MediSync Staff AI Assistant</h3>
                <span className="bg-teal-100 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  Bilingual / தமிழ்
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Natural language inventory query & shortage locator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/50">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white text-xs flex-shrink-0 mt-0.5">
                  <Bot size={14} />
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-2.5 text-xs max-w-[85%] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white font-medium rounded-br-none shadow-sm'
                    : 'bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-none whitespace-pre-line'
                }`}
              >
                {m.text}
              </div>
              {m.role === 'user' && (
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-white text-xs flex-shrink-0 mt-0.5">
                  <User size={14} />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 pl-9">
              <span className="h-2 w-2 rounded-full bg-teal-600 animate-ping"></span>
              Consulting medicine stock database...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-2 border-t border-slate-100 bg-white">
          <div className="text-[10px] text-slate-400 mb-1.5 font-medium px-2">Tap quick question:</div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 px-1">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(q)}
                className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-800 transition flex-shrink-0"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={lang === 'ta' ? 'கேள்வியை இங்கே தட்டச்சு செய்யவும்...' : 'Ask about stock, distance, or alerts...'}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
