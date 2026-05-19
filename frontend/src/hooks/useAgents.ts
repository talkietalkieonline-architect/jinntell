"use client";
import { useState, useEffect, useCallback } from "react";
import { getAgents, type AgentListResponse, type AgentOut } from "@/services/api";

/* ═══════════════════════════════════════════════
   useAgents — загрузка агентов из API с fallback
   ═══════════════════════════════════════════════ */

/** Хардкод-агенты для offline-режима (из seed.py) */
const FALLBACK_AGENTS: AgentOut[] = [
  { id: 1, name: "Дворецкий", profession: "Ассистент", brand: "JinnTell", agent_type: "system", description: "Ваш персональный помощник. Всегда рядом, всё знаю о сервисе.", color: "#FFD700", rating: 5.0, rating_count: 0 },
  { id: 2, name: "Новости СПб", profession: "Информатор", brand: "JinnTell", agent_type: "system", description: "Оперативные новости города: пробки, погода, МЧС, события.", color: "#2196F3", rating: 4.8, rating_count: 0 },
  { id: 3, name: "Макс", profession: "Юрист", brand: "JinnTell", agent_type: "system", description: "Юрист-консультант по ПДД. Объясню штрафы, права и обязанности водителя.", color: "#FF9800", rating: 4.6, rating_count: 0 },
  { id: 4, name: "Доктор Вера", profession: "Психолог", brand: "JinnTell", agent_type: "system", description: "Психолог-консультант. Поговорим о том, что беспокоит.", color: "#9C27B0", rating: 4.9, rating_count: 0 },
  { id: 5, name: "Почтальон", profession: "Ассистент", brand: "JinnTell", agent_type: "system", description: "Агент-почтальон. Проверю почту, уведомлю о важных письмах.", color: "#CDDC39", rating: 4.7, rating_count: 0 },
  { id: 6, name: "Тим", profession: "Консультант", brand: "Adidas", agent_type: "business", description: "Эксперт по спортивной одежде и обуви Adidas.", color: "#4CAF50", rating: 4.7, rating_count: 0 },
  { id: 7, name: "Алиса", profession: "Продавец", brand: "Zara", agent_type: "business", description: "Стилист-консультант Zara. Помогу собрать образ.", color: "#E91E63", rating: 4.5, rating_count: 0 },
  { id: 8, name: "Лена", profession: "Стилист", brand: "H&M", agent_type: "business", description: "Стилист H&M. Помогу подобрать гардероб.", color: "#F44336", rating: 4.3, rating_count: 0 },
  { id: 9, name: "Артём", profession: "Тренер", brand: "FitLife", agent_type: "business", description: "Персональный фитнес-тренер.", color: "#00BCD4", rating: 4.4, rating_count: 0 },
  { id: 10, name: "София", profession: "Аналитик", brand: "DataPro", agent_type: "business", description: "Бизнес-аналитик. Помогу разобраться с данными.", color: "#607D8B", rating: 4.2, rating_count: 0 },
  { id: 11, name: "Игорь", profession: "Консультант", brand: "Nike", agent_type: "business", description: "Консультант Nike. Кроссовки, экипировка.", color: "#FF5722", rating: 4.5, rating_count: 0 },
  { id: 12, name: "Мария", profession: "Лектор", brand: "EduTech", agent_type: "business", description: "Лектор по программированию.", color: "#3F51B5", rating: 4.8, rating_count: 0 },
  { id: 13, name: "Борис", profession: "Собеседник", brand: "JinnTell", agent_type: "citizen", description: "Просто хороший собеседник.", color: "#795548", rating: 4.0, rating_count: 0 },
  { id: 14, name: "Олег", profession: "Собеседник", brand: "JinnTell", agent_type: "citizen", description: "Разбираюсь в музыке, путешествиях, гастрономии.", color: "#8BC34A", rating: 3.9, rating_count: 0 },
];

interface UseAgentsResult {
  agents: AgentOut[];
  total: number;
  businessCount: number;
  citizenCount: number;
  systemCount: number;
  loading: boolean;
  isFromAPI: boolean;
  refetch: (params?: { search?: string; profession?: string; agent_type?: string }) => void;
}

export function useAgents(): UseAgentsResult {
  const [agents, setAgents] = useState<AgentOut[]>(FALLBACK_AGENTS);
  const [counts, setCounts] = useState({ total: 14, business: 7, citizen: 2, system: 5 });
  const [loading, setLoading] = useState(true);
  const [isFromAPI, setIsFromAPI] = useState(false);

  const fetchAgents = useCallback(
    async (params?: { search?: string; profession?: string; agent_type?: string }) => {
      setLoading(true);
      try {
        const data: AgentListResponse = await getAgents(params);
        setAgents(data.agents);
        setCounts({
          total: data.total,
          business: data.business_count,
          citizen: data.citizen_count,
          system: data.system_count,
        });
        setIsFromAPI(true);
      } catch {
        // API недоступен — используем fallback
        // Если есть параметры поиска, фильтруем локально
        let filtered = FALLBACK_AGENTS;
        if (params?.search) {
          const q = params.search.toLowerCase();
          filtered = filtered.filter(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              a.profession.toLowerCase().includes(q) ||
              a.brand.toLowerCase().includes(q)
          );
        }
        if (params?.profession) {
          filtered = filtered.filter((a) => a.profession === params.profession);
        }
        if (params?.agent_type) {
          filtered = filtered.filter((a) => a.agent_type === params.agent_type);
        }
        setAgents(filtered);
        setIsFromAPI(false);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return {
    agents,
    total: counts.total,
    businessCount: counts.business,
    citizenCount: counts.citizen,
    systemCount: counts.system,
    loading,
    isFromAPI,
    refetch: fetchAgents,
  };
}
