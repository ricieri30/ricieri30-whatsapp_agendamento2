import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { format } from 'date-fns-tz';
import {
  LayoutDashboard,
  MessageSquare,
  Settings,
  Bell,
  Power,
  Trash2,
  Copy,
  Edit3,
  Play,
  XCircle,
  Clock,
  Download,
  Upload,
  User,
  RefreshCw,
  LogOut,
  Search,
  Eraser
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io();

const App = () => {
  const [time, setTime] = useState('');
  const [rules, setRules] = useState([]);
  const [queue, setQueue] = useState([]);
  const [status, setStatus] = useState('initializing');
  const [qrCode, setQrCode] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    time: '08:00',
    message: '',
    emoji_filter: '',
    target_suffix: ''
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const spTime = format(new Date(), 'HH:mm:ss', { timeZone: 'America/Sao_Paulo' });
      setTime(spTime);
    }, 1000);

    fetchRules();
    fetchQueue();

    // Buscar status inicial
    axios.get('/api/status').then(res => {
      setStatus(res.data.status);
      if (res.data.qrCode) setQrCode(res.data.qrCode);
    });

    socket.on('qr', (url) => setQrCode(url));
    socket.on('status', (s) => setStatus(s));
    // Atualizar fila sempre que o servidor emitir sinal de mudança
    socket.on('queue_update', () => fetchQueue());

    // Polling de backup a cada 30s para garantir sincronia da fila
    const queueInterval = setInterval(() => fetchQueue(), 30000);

    return () => {
      clearInterval(timer);
      clearInterval(queueInterval);
    };
  }, []);

  const fetchRules = async () => {
    const res = await axios.get('/api/rules');
    setRules(res.data);
  };

  const fetchQueue = async () => {
    const res = await axios.get('/api/queue');
    setQueue(res.data);
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    if (newRule.id) {
      await axios.put(`/api/rules/${newRule.id}`, newRule);
    } else {
      await axios.post('/api/rules', newRule);
    }
    setNewRule({ name: '', time: '08:00', message: '', emoji_filter: '', target_suffix: '' });
    setShowModal(false);
    // Limpar lista antes de recarregar para forçar re-renderização
    setRules([]);
    await fetchRules();
  };

  const openEditModal = (rule) => {
    setNewRule({
      id: rule.id,
      name: rule.name,
      time: rule.time,
      message: rule.message,
      emoji_filter: rule.emoji_filter || '',
      target_suffix: rule.target_suffix || ''
    });
    setShowModal(true);
  };

  const handleCopyRule = async (rule) => {
    const copy = {
      name: `${rule.name} (Cópia)`,
      time: rule.time,
      message: rule.message,
      emoji_filter: rule.emoji_filter,
      target_suffix: rule.target_suffix
    };
    await axios.post('/api/rules', copy);
    fetchRules();
  };

  const toggleRule = async (id) => {
    await axios.patch(`/api/rules/${id}/toggle`);
    fetchRules();
  };

  const deleteRule = async (id) => {
    if (window.confirm('Excluir regra?')) {
      await axios.delete(`/api/rules/${id}`);
      fetchRules();
    }
  };

  const cancelQueueItem = async (id) => {
    await axios.delete(`/api/queue/${id}`);
    fetchQueue();
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Desconectar o WhatsApp? Será necessário escanear o QR code novamente.')) return;
    setDisconnecting(true);
    try { await axios.post('/api/disconnect'); } catch { }
    setTimeout(() => setDisconnecting(false), 10000);
  };

  const handleClearRules = async () => {
    if (!window.confirm('⚠️ Apagar TODAS as regras (e a fila)? Tem certeza?')) return;
    setClearing(true);
    try {
      await axios.delete('/api/rules/all');
      setRules([]);
      setQueue([]);
    } catch {
      alert('Erro ao limpar regras.');
    } finally {
      setClearing(false);
    }
  };

  const handleClearQueue = async () => {
    if (!window.confirm('⚠️ Limpar toda a lista de envio? Tem certeza?')) return;
    setClearing(true);
    try {
      await axios.delete('/api/queue/all');
      setQueue([]);
    } catch {
      alert('Erro ao limpar fila.');
    } finally {
      setClearing(false);
    }
  };

  const filteredRules = rules.filter(rule => {
    const matchText = filterText === '' ||
      rule.name.toLowerCase().includes(filterText.toLowerCase()) ||
      (rule.emoji_filter || '').toLowerCase().includes(filterText.toLowerCase()) ||
      (rule.target_suffix || '').toLowerCase().includes(filterText.toLowerCase());
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && rule.active) ||
      (filterActive === 'inactive' && !rule.active);
    return matchText && matchActive;
  });

  const exportRules = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rules));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "whatsapp_rules.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importRules = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        await axios.post('/api/rules/import', importedData);
        fetchRules();
        alert('Regras importadas com sucesso!');
      } catch (err) {
        alert('Erro ao importar arquivo. Certifique-se de que é um JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="bg-glow" />

      {/* HEADER */}
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-[#00ffa3] to-[#00ccff] bg-clip-text text-transparent">
            WhatsApp Scheduler PRO
          </h1>
          <p className="text-white/40 flex items-center gap-2 mt-1">
            <Clock size={14} /> São Paulo: <span className="text-[#00ffa3] font-mono">{time}</span>
          </p>
        </div>

        <div className="flex gap-3 items-center">
          {/* Limpar Regras */}
          <button
            onClick={handleClearRules}
            disabled={clearing}
            title="Apagar todas as regras"
            className={`p-2 rounded-lg border border-white/5 transition-all flex items-center gap-1.5 text-xs font-bold ${
              clearing
                ? 'bg-red-500/10 text-red-400 cursor-not-allowed'
                : 'bg-white/5 hover:bg-red-500/10 hover:text-red-400'
            }`}
          >
            <Eraser size={16} />
            <span className="hidden sm:inline">Regras</span>
          </button>

          {/* Limpar Fila */}
          <button
            onClick={handleClearQueue}
            disabled={clearing}
            title="Limpar lista de envio"
            className={`p-2 rounded-lg border border-white/5 transition-all flex items-center gap-1.5 text-xs font-bold ${
              clearing
                ? 'bg-orange-500/10 text-orange-400 cursor-not-allowed'
                : 'bg-white/5 hover:bg-orange-500/10 hover:text-orange-400'
            }`}
          >
            <XCircle size={16} />
            <span className="hidden sm:inline">Fila</span>
          </button>

          <label className="bg-white/5 p-2 rounded-lg hover:bg-white/10 transition-all border border-white/5 cursor-pointer" title="Importar Regras">
            <Upload size={20} />
            <input type="file" className="hidden" accept=".json" onChange={importRules} />
          </label>
          <button onClick={exportRules} className="bg-white/5 p-2 rounded-lg hover:bg-white/10 transition-all border border-white/5" title="Exportar Regras">
            <Download size={20} />
          </button>

          {/* Status + Botão Reconectar */}
          <div className={`px-3 py-2 rounded-full glass border border-white/10 flex items-center gap-2 text-sm`}>
            <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-[#00ffa3]' :
                restarting ? 'bg-yellow-400 animate-ping' :
                  'bg-yellow-500 animate-pulse'
              }`} />
            <span className="text-xs">
              {restarting ? 'Reconectando...' : status === 'connected' ? 'Conectado' : 'Aguardando Login'}
            </span>
          </div>

          {/* Botão Reiniciar Conexão */}
          <button
            onClick={async () => {
              setRestarting(true);
              try { await axios.post('/api/restart'); } catch { }
              setTimeout(() => setRestarting(false), 15000);
            }}
            disabled={restarting}
            title="Reiniciar conexão WhatsApp"
            className={`p-2 rounded-lg border border-white/5 transition-all ${restarting
                ? 'bg-yellow-500/10 text-yellow-400 cursor-not-allowed'
                : 'bg-white/5 hover:bg-yellow-500/10 hover:text-yellow-400'
              }`}
          >
            <RefreshCw size={20} className={restarting ? 'animate-spin' : ''} />
          </button>

          {/* Botão Desconectar — visível apenas quando conectado */}
          {status === 'connected' && (
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              title="Desconectar WhatsApp (limpa sessão)"
              className={`p-2 rounded-lg border border-white/5 transition-all ${disconnecting
                  ? 'bg-red-500/10 text-red-400 cursor-not-allowed'
                  : 'bg-white/5 hover:bg-red-500/10 hover:text-red-400'
                }`}
            >
              <LogOut size={20} />
            </button>
          )}

          <button className="btn-primary flex items-center gap-2" onClick={() => setShowModal(true)}>
            <Play size={18} fill="currentColor" /> Nova Regra
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* REGRAS SECTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <MessageSquare size={20} className="text-[#00ffa3]" /> Regras de Envio
            </h2>
          </div>

          {/* Barra de Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex-1 min-w-[160px] relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Buscar regra..."
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                className="w-full input-glass pl-8 text-xs"
              />
            </div>
            <div className="flex gap-1">
              {[['all', 'Todas'], ['active', 'Ativas'], ['inactive', 'Inativas']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilterActive(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${filterActive === val
                      ? 'bg-[#00ffa3]/15 text-[#00ffa3] border-[#00ffa3]/30'
                      : 'bg-white/5 text-white/40 border-white/5 hover:bg-white/10 hover:text-white/70'
                    }`}
                >
                  {label}
                  {val === 'all' && rules.length > 0 && <span className="ml-1 opacity-60">({rules.length})</span>}
                  {val === 'active' && <span className="ml-1 opacity-60">({rules.filter(r => r.active).length})</span>}
                  {val === 'inactive' && <span className="ml-1 opacity-60">({rules.filter(r => !r.active).length})</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence>
              {filteredRules.length === 0 && (
                <div className="text-center py-10 text-white/20 italic text-sm">
                  {filterText || filterActive !== 'all' ? 'Nenhuma regra corresponde ao filtro.' : 'Nenhuma regra cadastrada.'}
                </div>
              )}
              {filteredRules.map((rule) => (
                <motion.div
                  key={`${rule.id}-${rule.time}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`glass p-4 rounded-2xl transition-all ${!rule.active && 'opacity-40'}`}
                >
                  <div className="flex justify-between items-start">
                    {/* Info */}
                    <div className="flex items-center gap-4">
                      {/* Emoji Badge */}
                      <div className="bg-white/5 w-14 h-14 min-w-14 rounded-xl flex items-center justify-center text-2xl border border-white/5">
                        {rule.emoji_filter || (rule.target_suffix ? '🎯' : '💬')}
                      </div>
                      <div>
                        <h3 className="font-bold text-base leading-tight">{rule.name}</h3>
                        {/* Horário em destaque */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="bg-[#00ffa3]/10 text-[#00ffa3] text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={10} /> {rule.time}
                          </span>
                          {/* Filtro em destaque */}
                          {(rule.emoji_filter || rule.target_suffix) && (
                            <span className="bg-white/5 text-white/60 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                              <User size={10} /> {rule.emoji_filter || rule.target_suffix}
                            </span>
                          )}
                          {/* Badge Ativo/Inativo */}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${rule.active ? 'bg-[#00ffa3]/10 text-[#00ffa3]' : 'bg-red-500/10 text-red-400'}`}>
                            {rule.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Ações */}
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={() => toggleRule(rule.id)} className={`p-2 rounded-lg transition-all ${rule.active ? 'hover:bg-[#00ffa3]/10 text-[#00ffa3]/60 hover:text-[#00ffa3]' : 'hover:bg-red-500/10 text-red-400/60 hover:text-red-400'}`}>
                        <Power size={16} />
                      </button>
                      <button onClick={() => openEditModal(rule)} className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => handleCopyRule(rule)} className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-lg transition-all">
                        <Copy size={16} />
                      </button>
                      <button onClick={() => deleteRule(rule.id)} className="p-2 text-red-500/30 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* QUEUE & QR SECTION */}
        <div className="space-y-8">
          {/* QR CODE - Ocultar completamente se estiver conectado */}
          {status !== 'connected' && (
            <div className="glass p-6 rounded-3xl text-center border-2 border-[#00ffa3]/20">
              <h3 className="font-bold mb-4 text-[#00ffa3]">Autenticação WhatsApp</h3>
              {qrCode ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <img src={qrCode} alt="QR Code" className="mx-auto rounded-xl mb-4 border-8 border-white bg-white p-2" />
                  <p className="text-xs text-white/40 animate-pulse">Aguardando leitura do QR Code...</p>
                </motion.div>
              ) : (
                <div className="py-12 flex flex-col items-center gap-4 text-white/20">
                  <Clock size={40} className="animate-spin-slow" />
                  <p className="text-sm italic">Gerando QR Code...</p>
                </div>
              )}
            </div>
          )}

          {/* FILA */}
          <div className="glass p-6 rounded-3xl min-h-[400px]">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Bell size={20} className="text-[#00ccff]" /> Fila de Envio
            </h2>
            <div className="space-y-4">
              {queue.length === 0 && (
                <div className="text-center py-12 text-white/20 italic">
                  Nenhuma mensagem na fila
                </div>
              )}
              {queue.map((item) => (
                <div key={item.id} className="bg-white/5 p-3 rounded-xl border border-white/5 text-sm flex justify-between items-center">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="font-bold">{item.contact_name}</div>
                    <div className="text-white/40 text-xs truncate">{item.message}</div>
                  </div>
                  <button
                    onClick={() => cancelQueueItem(item.id)}
                    title="Cancelar envio"
                    className="text-red-400 hover:text-red-500 transition-all flex-shrink-0 p-1 rounded hover:bg-red-500/10"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL NOVA REGRA */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass w-full max-w-md p-8 rounded-3xl border border-white/20"
          >
            <h2 className="text-2xl font-black mb-6">Configurar Regra</h2>
            <form onSubmit={handleCreateRule} className="space-y-4 text-sm font-semibold">
              <div className="space-y-2">
                <label className="text-white/40">Nome da Regra</label>
                <input
                  autoFocus
                  placeholder="Ex: Bom dia Clientes"
                  className="w-full input-glass"
                  value={newRule.name}
                  onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                <div className="space-y-2">
                  <label className="text-white/40">Horário (SP)</label>
                  <input
                    type="time"
                    className="w-full input-glass"
                    value={newRule.time}
                    onChange={e => setNewRule({ ...newRule, time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-white/40">Filtro (Emoji ou Sufixo)</label>
                  <div className="flex gap-2">
                    <input
                      placeholder="Emoji (ex: 🟢)"
                      className="w-1/3 input-glass"
                      value={newRule.emoji_filter}
                      onChange={e => setNewRule({ ...newRule, emoji_filter: e.target.value })}
                    />
                    <input
                      placeholder="Sufixo (ex: ////)"
                      className="w-2/3 input-glass"
                      value={newRule.target_suffix}
                      onChange={e => setNewRule({ ...newRule, target_suffix: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-white/40">Mensagem Diária (Use: [NOME], [SOBRENOME], [SAUDACAO], [DIA_DA_SEMANA])</label>
                <textarea
                  rows="4"
                  placeholder="Olá [NOME], como vai?"
                  className="w-full input-glass resize-none"
                  value={newRule.message}
                  onChange={e => setNewRule({ ...newRule, message: e.target.value })}
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => {
                  setShowModal(false);
                  setNewRule({ name: '', time: '08:00', message: '', emoji_filter: '', target_suffix: '' });
                }} className="flex-1 bg-white/5 py-3 rounded-xl hover:bg-white/10 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 btn-primary py-3">Salvar Regra</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default App;
