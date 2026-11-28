-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Servidor: bl3cjr2ora1389s305h0-mysql.services.clever-cloud.com:3306
-- Tiempo de generación: 28-11-2026 a las 00:29:32
-- Versión del servidor: 8.4.2-2
-- Versión de PHP: 8.2.36

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `bl3cjr2ora1389s305h0`
--
CREATE DATABASE IF NOT EXISTS `bl3cjr2ora1389s305h0` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `bl3cjr2ora1389s305h0`;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `gastos`
--

CREATE TABLE `gastos` (
  `id_gasto` int NOT NULL,
  `id_grupo` int NOT NULL,
  `id_pagador` int NOT NULL,
  `tipo` enum('gasto','abono') DEFAULT 'gasto',
  `id_receptor` int DEFAULT NULL,
  `concepto` varchar(150) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `foto_ticket` longtext,
  `liquidado` tinyint(1) DEFAULT '0',
  `fecha_gasto` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `grupos`
--

CREATE TABLE `grupos` (
  `id_grupo` int NOT NULL,
  `nombre_grupo` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `codigo_invitacion` varchar(8) DEFAULT NULL,
  `id_creador` int NOT NULL,
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `miembros_grupo`
--

CREATE TABLE `miembros_grupo` (
  `id_membresia` int NOT NULL,
  `id_grupo` int NOT NULL,
  `id_usuario` int NOT NULL,
  `rol` enum('admin','invitado') DEFAULT 'invitado'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id_usuario` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `correo` varchar(120) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id_usuario`, `nombre`, `correo`, `password_hash`, `fecha_registro`) VALUES
(1, 'Nathan', 'nathan@ejemplo.edu.mx', 'hash_prueba_123', '2026-11-27 18:32:42'),
(2, 'Ana', 'ana@ejemplo.edu.mx', 'hash_prueba_123', '2026-11-27 18:32:42'),
(3, 'Luis', 'luis@ejemplo.edu.mx', 'hash_prueba_123', '2026-11-27 18:32:42'),
(4, 'Carlos', 'carlos@ejemplo.edu.mx', 'password123', '2026-11-27 19:50:33');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `gastos`
--
ALTER TABLE `gastos`
  ADD PRIMARY KEY (`id_gasto`),
  ADD KEY `id_grupo` (`id_grupo`),
  ADD KEY `id_pagador` (`id_pagador`),
  ADD KEY `id_receptor` (`id_receptor`);

--
-- Indices de la tabla `grupos`
--
ALTER TABLE `grupos`
  ADD PRIMARY KEY (`id_grupo`),
  ADD UNIQUE KEY `codigo_invitacion` (`codigo_invitacion`),
  ADD KEY `id_creador` (`id_creador`);

--
-- Indices de la tabla `miembros_grupo`
--
ALTER TABLE `miembros_grupo`
  ADD PRIMARY KEY (`id_membresia`),
  ADD UNIQUE KEY `uk_grupo_usuario` (`id_grupo`,`id_usuario`),
  ADD KEY `id_usuario` (`id_usuario`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id_usuario`),
  ADD UNIQUE KEY `correo` (`correo`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `gastos`
--
ALTER TABLE `gastos`
  MODIFY `id_gasto` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `grupos`
--
ALTER TABLE `grupos`
  MODIFY `id_grupo` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `miembros_grupo`
--
ALTER TABLE `miembros_grupo`
  MODIFY `id_membresia` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id_usuario` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `gastos`
--
ALTER TABLE `gastos`
  ADD CONSTRAINT `gastos_ibfk_1` FOREIGN KEY (`id_grupo`) REFERENCES `grupos` (`id_grupo`) ON DELETE CASCADE,
  ADD CONSTRAINT `gastos_ibfk_2` FOREIGN KEY (`id_pagador`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE,
  ADD CONSTRAINT `gastos_ibfk_3` FOREIGN KEY (`id_receptor`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL;

--
-- Filtros para la tabla `grupos`
--
ALTER TABLE `grupos`
  ADD CONSTRAINT `grupos_ibfk_1` FOREIGN KEY (`id_creador`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE;

--
-- Filtros para la tabla `miembros_grupo`
--
ALTER TABLE `miembros_grupo`
  ADD CONSTRAINT `miembros_grupo_ibfk_1` FOREIGN KEY (`id_grupo`) REFERENCES `grupos` (`id_grupo`) ON DELETE CASCADE,
  ADD CONSTRAINT `miembros_grupo_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
