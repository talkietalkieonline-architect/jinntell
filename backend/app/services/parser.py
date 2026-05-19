"""
Parser Service — скачивание и разбивка юридических/любых текстов на chunks.
Поддержка: consultant.ru, garant.ru, любой HTML/текст по URL.
"""
import re
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import date

import httpx


@dataclass
class Article:
    """Разобранная статья/раздел документа."""
    number: str  # "12.1", "ст. 80" и т.д.
    title: str
    text: str
    edition_date: Optional[date] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class Chunk:
    """Чанк для индексации в RAG."""
    text: str
    article_number: str = ""
    layer: str = "law"  # law / changes / explanations
    source_title: str = ""
    metadata: dict = field(default_factory=dict)


class LegalParser:
    """Парсер юридических документов."""

    # Максимальный размер чанка (символов)
    MAX_CHUNK_SIZE = 1500
    # Перекрытие между чанками
    CHUNK_OVERLAP = 200

    async def fetch_document(self, url: str) -> str:
        """Скачать HTML/текст документа по URL."""
        async with httpx.AsyncClient(
            timeout=60.0,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; JinnTellBot/1.0)",
                "Accept": "text/html,application/xhtml+xml,text/plain",
            },
        ) as client:
            r = await client.get(url)
            if r.status_code != 200:
                raise RuntimeError(f"Failed to fetch {url}: HTTP {r.status_code}")
            return r.text

    def extract_text_from_html(self, html: str) -> str:
        """Простое извлечение текста из HTML (без BeautifulSoup для минимизации зависимостей)."""
        # Удаляем скрипты и стили
        text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
        # Заменяем br и p на перенос строки
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</p>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</div>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</li>", "\n", text, flags=re.IGNORECASE)
        # Удаляем все теги
        text = re.sub(r"<[^>]+>", "", text)
        # Декодируем HTML entities
        text = text.replace("&nbsp;", " ").replace("&mdash;", "—")
        text = text.replace("&laquo;", "«").replace("&raquo;", "»")
        text = text.replace("&lt;", "<").replace("&gt;", ">")
        text = text.replace("&amp;", "&").replace("&quot;", '"')
        # Убираем лишние пробелы
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def extract_articles(self, text: str, source_type: str = "custom") -> List[Article]:
        """
        Разбить текст на статьи/разделы.
        Для законов: ищем "Статья N." / "N.N."
        Для произвольного текста: разбиваем по заголовкам или абзацам.
        """
        articles = []

        if source_type in ("consultant", "garant", "pravo"):
            # Юридический текст — ищем статьи
            articles = self._extract_law_articles(text)
        else:
            # Произвольный текст — разбиваем по заголовкам или большим абзацам
            articles = self._extract_generic_sections(text)

        return articles if articles else [Article(number="1", title="Весь документ", text=text)]

    def _extract_law_articles(self, text: str) -> List[Article]:
        """Разбивка юридического текста на статьи."""
        # Паттерн: "Статья 12.1." или "Статья 80." с необязательной точкой
        pattern = r"(Статья\s+(\d+(?:\.\d+)?)\.\s*([^\n]*?))\n"
        matches = list(re.finditer(pattern, text))

        if not matches:
            # Попробуем другой паттерн: "N.N. Text" (для ПДД)
            pattern = r"(?:^|\n)((\d+\.\d+)\.\s+([^\n]*))"
            matches = list(re.finditer(pattern, text))

        if not matches:
            return []

        articles = []
        for i, m in enumerate(matches):
            number = m.group(2)
            title = m.group(3).strip()
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            article_text = text[start:end].strip()

            # Ищем дату редакции
            edition = self._detect_edition_date(article_text)

            articles.append(Article(
                number=number,
                title=title,
                text=article_text,
                edition_date=edition,
            ))

        return articles

    def _extract_generic_sections(self, text: str) -> List[Article]:
        """Разбивка произвольного текста по разделам/абзацам."""
        # Ищем заголовки (строки в верхнем регистре или с нумерацией)
        lines = text.split("\n")
        sections = []
        current_section = Article(number="1", title="", text="")
        section_num = 1

        for line in lines:
            stripped = line.strip()
            if not stripped:
                current_section.text += "\n"
                continue

            # Определяем заголовок: короткая строка < 100 символов, заканчивается без точки
            is_heading = (
                len(stripped) < 100
                and not stripped.endswith(".")
                and (stripped.isupper() or re.match(r"^\d+[\.\)]\s+", stripped) or re.match(r"^[IVXLC]+\.\s+", stripped))
            )

            if is_heading and current_section.text.strip():
                sections.append(current_section)
                section_num += 1
                current_section = Article(number=str(section_num), title=stripped, text="")
            else:
                current_section.text += stripped + "\n"

        if current_section.text.strip():
            sections.append(current_section)

        return sections

    def chunk_articles(self, articles: List[Article], source_title: str = "", layer: str = "law") -> List[Chunk]:
        """Разбить статьи на chunks для RAG."""
        chunks = []
        for article in articles:
            article_chunks = self._split_text(article.text, article.number, source_title, layer)
            # Добавляем заголовок статьи в первый чанк
            if article_chunks and article.title:
                first = article_chunks[0]
                first.text = f"[{article.title}]\n{first.text}"
                first.metadata["title"] = article.title
            if article.edition_date:
                for c in article_chunks:
                    c.metadata["edition_date"] = article.edition_date.isoformat()
            chunks.extend(article_chunks)
        return chunks

    def chunk_text(self, text: str, source_title: str = "", layer: str = "law") -> List[Chunk]:
        """Разбить произвольный текст на chunks (без разбивки на статьи)."""
        return self._split_text(text, "", source_title, layer)

    def _split_text(self, text: str, article_number: str, source_title: str, layer: str) -> List[Chunk]:
        """Разбить текст на chunks с перекрытием."""
        text = text.strip()
        if not text:
            return []

        if len(text) <= self.MAX_CHUNK_SIZE:
            return [Chunk(
                text=text,
                article_number=article_number,
                layer=layer,
                source_title=source_title,
            )]

        chunks = []
        # Разбиваем по предложениям
        sentences = re.split(r"(?<=[.!?])\s+", text)
        current_chunk = ""

        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 > self.MAX_CHUNK_SIZE:
                if current_chunk:
                    chunks.append(Chunk(
                        text=current_chunk.strip(),
                        article_number=article_number,
                        layer=layer,
                        source_title=source_title,
                    ))
                    # Overlap: берём последние N символов
                    overlap_text = current_chunk[-self.CHUNK_OVERLAP:] if len(current_chunk) > self.CHUNK_OVERLAP else ""
                    current_chunk = overlap_text + " " + sentence
                else:
                    # Одно предложение > MAX_CHUNK_SIZE — режем жёстко
                    for i in range(0, len(sentence), self.MAX_CHUNK_SIZE - self.CHUNK_OVERLAP):
                        chunk_text = sentence[i:i + self.MAX_CHUNK_SIZE]
                        chunks.append(Chunk(
                            text=chunk_text.strip(),
                            article_number=article_number,
                            layer=layer,
                            source_title=source_title,
                        ))
                    current_chunk = ""
            else:
                current_chunk += (" " if current_chunk else "") + sentence

        if current_chunk.strip():
            chunks.append(Chunk(
                text=current_chunk.strip(),
                article_number=article_number,
                layer=layer,
                source_title=source_title,
            ))

        return chunks

    def _detect_edition_date(self, text: str) -> Optional[date]:
        """Извлечь дату редакции из текста (в ред. от DD.MM.YYYY)."""
        patterns = [
            r"в\s+ред(?:акции)?\.?\s+от\s+(\d{2})\.(\d{2})\.(\d{4})",
            r"от\s+(\d{2})\.(\d{2})\.(\d{4})\s+[NН№]",
        ]
        for pattern in patterns:
            m = re.search(pattern, text)
            if m:
                try:
                    return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                except ValueError:
                    continue
        return None


# Singleton
parser = LegalParser()


async def parse_and_chunk(url: str, source_type: str = "custom", source_title: str = "", layer: str = "law") -> List[Chunk]:
    """
    Основная функция: скачать → извлечь текст → разбить на статьи → разбить на chunks.
    """
    # Скачать
    html = await parser.fetch_document(url)

    # Извлечь текст
    text = parser.extract_text_from_html(html) if "<html" in html.lower() or "<body" in html.lower() else html

    # Разбить на статьи
    articles = parser.extract_articles(text, source_type)

    # Разбить на chunks
    chunks = parser.chunk_articles(articles, source_title=source_title, layer=layer)

    print(f"[parser] {url} → {len(articles)} articles → {len(chunks)} chunks")
    return chunks


async def parse_raw_text(text: str, source_title: str = "", layer: str = "law") -> List[Chunk]:
    """
    Разбить сырой текст (вручную вставленный) на chunks.
    Без скачивания по URL.
    """
    articles = parser.extract_articles(text, "custom")
    chunks = parser.chunk_articles(articles, source_title=source_title, layer=layer)
    print(f"[parser] raw text → {len(articles)} articles → {len(chunks)} chunks")
    return chunks
