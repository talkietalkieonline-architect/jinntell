import type { Metadata } from "next";
import PrintButton from "../PrintButton";

export const metadata: Metadata = {
  title: "Джинн кофейни: кофе ждёт гостя — КП JinnTell",
  description:
    "Коммерческое предложение для кофеен: заказ к времени голосом, оплата по QR напрямую кофейне, голос заказов для бариста и зазывала, который приглашает прохожих рядом.",
};

/** КП для кофеен. Серверная страница; печатается в PDF кнопкой. */
export default function KpCafePage() {
  return (
    <main>
      <header className="ab-hero">
        <div className="ab-wrap">
          <div className="ab-eyebrow">Коммерческое предложение · кофейни</div>
          <h1>Кофе ждёт гостя, а не гость — кофе</h1>
          <p className="ab-lead">
            У кофейни появляется свой ИИ-бариста. Гость говорит, что приготовить и когда придёт, — к его приходу всё готово.
            Платит по QR напрямую вам, а джинн сам объявляет заказ бариста и зовёт прохожих рядом.
          </p>
          <div className="ab-actions">
            <a className="ab-btn ab-btn-gold ab-noprint" href="#next">Обсудить пилот</a>
            <PrintButton />
          </div>
        </div>
      </header>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Как это работает для гостя</h2>
          <p className="ab-intro">Без приложения кофейни и без очереди у стойки — разговором, как с живым бариста.</p>
          <ol className="ab-steps">
            <li>Находит кофейню: по QR на двери или стойке, через своего личного помощника в Городе JinnTell или по приглашению зазывалы, проходя мимо.</li>
            <li>Говорит голосом или пишет: «Капучино на овсяном и сырник, буду через 20 минут, Миша».</li>
            <li>Джинн подтверждает заказ и время, считает сумму и по желанию присылает QR для оплаты.</li>
            <li>За 15 минут личный помощник гостя напоминает, что пора выходить.</li>
            <li>Гость приходит, называет имя и забирает заказ.</li>
          </ol>
        </div>
      </section>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Что получает кофейня</h2>
          <div className="ab-grid">
            <div className="ab-card">
              <h3>Заказы к времени</h3>
              <p>Каждый заказ — в реестре бариста на планшете: что, к какому времени, для кого. Отметки «Готов» и «Выдан».</p>
            </div>
            <div className="ab-card">
              <h3>Джинн объявляет заказ вслух</h3>
              <p>Новый заказ звучит голосом вашего джинна: «Капучино и сырник к 9:20 для Миши». Бариста не нужно смотреть в экран.</p>
            </div>
            <div className="ab-card">
              <h3>Оплата по QR напрямую вам</h3>
              <p>Джинн присылает платёжный QR: сумма и номер заказа уже внутри, банк гостя сам подставит ваши реквизиты. Деньги идут вам, JinnTell с оплат комиссию не берёт.</p>
            </div>
            <div className="ab-card">
              <h3>Зазывала за углом</h3>
              <p>Прохожий с JinnTell в нескольких десятках метров получает приглашение с вашей акцией: «Вы в двух минутах от нас — до 10:00 сырник за полцены».</p>
            </div>
            <div className="ab-card">
              <h3>Знает ваше меню</h3>
              <p>Отвечает 24/7 про напитки, молоко, сиропы, цены и акции — строго по вашему меню. Меню и цены вы меняете сами в кабинете.</p>
            </div>
            <div className="ab-card">
              <h3>Видно, что работает</h3>
              <p>Заказы, разговоры, показы зазывалы и расходы — в личном кабинете кофейни.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Почему джинн, а не своё приложение или агрегатор</h2>
          <div className="ab-grid">
            <div className="ab-card">
              <h3>Гостю ничего не нужно ставить</h3>
              <p>QR или ссылка открывают джинна сразу в браузере. Свое приложение кофейни гости скачивают редко.</p>
            </div>
            <div className="ab-card">
              <h3>Без комиссии с заказа</h3>
              <p>Вы платите аренду джинна и разговоры по факту, а не процент с каждого чека.</p>
            </div>
            <div className="ab-card">
              <h3>Вас находят через Город</h3>
              <p>На вопрос «где рядом выпить кофе» личные помощники жителей спрашивают джиннов Города — и ваш отвечает сам.</p>
            </div>
            <div className="ab-card">
              <h3>Собеседник с характером</h3>
              <p>Своё имя, голос и манера — лицо кофейни, которое помнит, что гость любит.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Что уже работает</h2>
          <p className="ab-intro">
            Демо-кофейня работает уже сейчас — покажем на встрече с телефона: заказ голосом к времени, платёжный QR с суммой,
            реестр бариста с голосовым объявлением заказа и отметкой оплаты, зазывала по геолокации с учётом показов.
          </p>
        </div>
      </section>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Этапы внедрения</h2>
          <p className="ab-intro">Пилот стартует за несколько дней и без доработок ваших систем.</p>
          <div className="ab-phases">
            <div className="ab-phase is-now">
              <div className="ab-num">Этап 1 · пилот</div>
              <ul>
                <li>Джинн с вашим меню и акциями</li>
                <li>Заказы к времени и реестр бариста</li>
                <li>Голос заказов</li>
                <li>QR на двери и стойке</li>
              </ul>
            </div>
            <div className="ab-phase">
              <div className="ab-num">Этап 2 · деньги и трафик</div>
              <ul>
                <li>Оплата по QR на ваши реквизиты</li>
                <li>Зазывала с промокодом</li>
                <li>Канал акций в Городе</li>
              </ul>
            </div>
            <div className="ab-phase">
              <div className="ab-num">Скоро</div>
              <ul>
                <li>Автоподтверждение оплаты через банк</li>
                <li>«Как обычно?» — память о любимом заказе</li>
                <li>Видео-аватар бариста на экране в зале</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="ab-sec">
        <div className="ab-wrap">
          <h2>Стоимость</h2>
          <div className="ab-table-wrap">
            <table className="ab-table">
              <thead><tr><th>Статья</th><th>Условия</th></tr></thead>
              <tbody>
                <tr><td>Аренда джинна кофейни</td><td><b>от 9 900 ₽ в месяц</b></td></tr>
                <tr><td>Разговоры</td><td>по факту: ответ текстом ≈ 0,25 ₽; голос — распознавание ≈ 1 ₽ за фразу, озвучка ≈ 1 ₽ за 1000 знаков</td></tr>
                <tr><td>Зазывала</td><td>по согласованию</td></tr>
                <tr><td>Оплаты гостей по QR</td><td>напрямую на ваш счёт, без комиссии JinnTell (банк — по вашему тарифу)</td></tr>
                <tr><td>Сеть кофеен</td><td>по согласованию</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="next" className="ab-sec" style={{ borderBottom: 0 }}>
        <div className="ab-wrap">
          <h2>Следующий шаг</h2>
          <p className="ab-intro">Встреча на 30 минут: покажем демо на телефоне, загрузим ваше меню и подготовим QR для двери и стойки.</p>
          <p className="ab-noprint"><a className="ab-btn ab-btn-gold" href="/promoter/spb?src=kp-cafe">Задать вопрос промоутеру</a></p>
          <p>JinnTell · разработчик — WCDI, We Can Do It · <a href="https://wcdi.tech" rel="noopener">wcdi.tech</a></p>
        </div>
      </section>
    </main>
  );
}
