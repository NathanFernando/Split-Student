CREATE DATABASE IF NOT EXISTS splitstudent_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE splitstudent_db;

-- 1. Tabla de usuarios
CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de grupos
CREATE TABLE grupos (
    id_grupo INT AUTO_INCREMENT PRIMARY KEY,
    nombre_grupo VARCHAR(120) NOT NULL,
    descripcion TEXT,
    id_creador INT NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_creador) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT
);

-- 3. Tabla intermedia de miembros por grupo (Admin / Invitado)
CREATE TABLE miembros_grupo (
    id_membresia INT AUTO_INCREMENT PRIMARY KEY,
    id_grupo INT NOT NULL,
    id_usuario INT NOT NULL,
    rol ENUM('admin', 'invitado') DEFAULT 'invitado',
    FOREIGN KEY (id_grupo) REFERENCES grupos(id_grupo) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    UNIQUE KEY uk_grupo_usuario (id_grupo, id_usuario)
);

-- 4. Tabla de gastos compartidos
CREATE TABLE gastos (
    id_gasto INT AUTO_INCREMENT PRIMARY KEY,
    id_grupo INT NOT NULL,
    id_pagador INT NOT NULL,
    concepto VARCHAR(150) NOT NULL,
    monto DECIMAL(10, 2) NOT NULL,
    foto_ticket LONGTEXT NULL,
    liquidado TINYINT(1) DEFAULT 0,
    fecha_gasto DATE NOT NULL,
    FOREIGN KEY (id_grupo) REFERENCES grupos(id_grupo) ON DELETE CASCADE,
    FOREIGN KEY (id_pagador) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT
);

-- Datos iniciales de prueba (sin contraseñas reales sensibles)
INSERT INTO usuarios (nombre, correo, password_hash) VALUES
('Nathan', 'nathan@ejemplo.edu.mx', 'hash_prueba_123'),
('Ana', 'ana@ejemplo.edu.mx', 'hash_prueba_123'),
('Luis', 'luis@ejemplo.edu.mx', 'hash_prueba_123'),
('Carlos', 'carlos@ejemplo.edu.mx', 'hash_prueba_123');

INSERT INTO grupos (nombre_grupo, descripcion, id_creador) VALUES
('Proyecto Apps Híbridas', 'Impresiones, materiales y café de equipo', 1),
('Gastos Depa 302', 'Internet, luz y despensa compartida', 3);

INSERT INTO miembros_grupo (id_grupo, id_usuario, rol) VALUES
(1, 1, 'admin'), (1, 2, 'invitado'), (1, 3, 'invitado'), (1, 4, 'invitado'),
(2, 3, 'admin'), (2, 1, 'invitado');

INSERT INTO gastos (id_grupo, id_pagador, concepto, monto, liquidado, fecha_gasto) VALUES
(1, 1, 'Impresión de planos y brief', 160.00, 0, CURDATE()),
(1, 2, 'Compra de cables USB y adaptador', 240.00, 0, CURDATE());